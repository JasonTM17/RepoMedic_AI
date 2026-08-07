import { timingSafeEqual } from "node:crypto";

import express, { type ErrorRequestHandler } from "express";

import {
  approvalRequestSchema,
  discoverRepositoryRoot,
  RepairService,
  RepairServiceError,
  repairRequestSchema,
  MemoryRepairRunStore,
  type ModelFactory,
  type RepairRunStore,
  type RepairServiceOptions,
} from "./repair-service.js";

export interface CreateAppOptions {
  repositoryRoot?: string;
  service?: RepairService;
  modelFactory?: ModelFactory;
  checksToRun?: RepairServiceOptions["checksToRun"];
  maxExplorerIterations?: number;
  maxStoredRuns?: number;
  persistence?: "file" | "memory";
  dataDir?: string;
  store?: RepairRunStore;
  apiToken?: string | null;
}

function validationDetails(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

function parseRequest<T>(
  schema: {
    safeParse: (value: unknown) =>
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: Array<{ path: PropertyKey[]; message: string }> };
        };
  },
  body: unknown,
  name: string,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new RepairServiceError(
      400,
      "INVALID_REQUEST",
      `${name} is invalid.`,
      validationDetails(parsed.error),
    );
  }
  return parsed.data;
}

function installCors(app: express.Express): void {
  const allowedOrigins = (process.env["CORS_ORIGIN"] ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use((request, response, next) => {
    const origin = request.header("origin");
    const isAllowed = origin === undefined || allowedOrigins.includes(origin);

    if (origin !== undefined) response.vary("Origin");
    if (origin !== undefined && isAllowed) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      response.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
    }

    if (request.method === "OPTIONS") {
      if (!isAllowed) {
        response.status(403).json({
          code: "CORS_ORIGIN_DENIED",
          message: "The request origin is not allowed.",
        });
        return;
      }
      response.status(204).end();
      return;
    }

    next();
  });
}

function hasValidBearerToken(
  authorization: string | undefined,
  expectedToken: string,
): boolean {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return false;
  const received = Buffer.from(match[1].trim());
  const expected = Buffer.from(expectedToken);
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

function installApiAuth(app: express.Express, configuredToken?: string): void {
  const token = configuredToken?.trim();
  if (!token) return;

  app.use((request, response, next) => {
    if (!request.path.startsWith("/v1/")) {
      next();
      return;
    }

    if (hasValidBearerToken(request.header("authorization"), token)) {
      next();
      return;
    }

    response.status(401).json({
      code: "UNAUTHORIZED",
      message: "A valid bearer token is required for repair API access.",
    });
  });
}

/** Creates the HTTP application without binding a network port. */
export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const service =
    options.service ??
    new RepairService({
      repositoryRoot: options.repositoryRoot ?? discoverRepositoryRoot(),
      ...(options.modelFactory !== undefined
        ? { modelFactory: options.modelFactory }
        : {}),
      ...(options.checksToRun !== undefined
        ? { checksToRun: options.checksToRun }
        : {}),
      ...(options.maxExplorerIterations !== undefined
        ? { maxExplorerIterations: options.maxExplorerIterations }
        : {}),
      ...(options.maxStoredRuns !== undefined
        ? { maxStoredRuns: options.maxStoredRuns }
        : {}),
      ...(options.store !== undefined
        ? { store: options.store }
        : options.persistence === "memory"
          ? { store: new MemoryRepairRunStore() }
          : {}),
      ...(options.dataDir !== undefined ? { dataDir: options.dataDir } : {}),
      ...(options.dataDir === undefined && process.env["REPOMEDIC_DATA_DIR"]
        ? { dataDir: process.env["REPOMEDIC_DATA_DIR"] }
        : {}),
    });

  app.disable("x-powered-by");
  installCors(app);
  installApiAuth(
    app,
    options.apiToken === undefined
      ? process.env["REPOMEDIC_API_TOKEN"]
      : (options.apiToken ?? undefined),
  );
  app.use(express.json({ limit: "32kb" }));

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/readyz", (_request, response) => {
    if (service.persistenceWarning !== undefined) {
      response.status(503).json({
        code: "PERSISTENCE_RECOVERY_REQUIRED",
        message: service.persistenceWarning,
      });
      return;
    }
    response.status(200).json({ status: "ready" });
  });

  app.get("/metrics", (_request, response) => {
    response
      .status(200)
      .type("text/plain")
      .send('repomedic_api_info{service="api"} 1\n');
  });

  app.post("/v1/repairs", async (request, response) => {
    const input = parseRequest(
      repairRequestSchema,
      request.body,
      "Repair request",
    );
    const run = await service.create(input);
    response.status(201).json(run);
  });

  app.get("/v1/repairs", (_request, response) => {
    const items = service.list();
    response.status(200).json({ items, total: items.length });
  });

  app.get("/v1/repairs/:repairId", (request, response) => {
    response.status(200).json(service.get(request.params.repairId));
  });

  app.post("/v1/repairs/:repairId/approval", async (request, response) => {
    const input = parseRequest(
      approvalRequestSchema,
      request.body,
      "Approval request",
    );
    const run = await service.decide(request.params.repairId, input);
    response.status(200).json(run);
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    const isBodyParseError =
      error instanceof SyntaxError &&
      "status" in error &&
      error.status === 400 &&
      "body" in error;

    if (isBodyParseError) {
      response
        .status(400)
        .json({ code: "INVALID_JSON", message: "Invalid JSON body" });
      return;
    }

    if (error instanceof RepairServiceError) {
      const payload = {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      };
      response.status(error.statusCode).json(payload);
      return;
    }

    response
      .status(500)
      .json({ code: "INTERNAL_ERROR", message: "Internal server error" });
  };

  app.use(errorHandler);

  return app;
}
