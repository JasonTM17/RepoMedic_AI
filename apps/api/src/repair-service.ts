import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, resolve, sep } from "node:path";

import {
  createModelAdapter,
  runBoundedRetry,
  runCoordinator,
  type Approval,
  type BoundedRetryResult,
  type CheckCommand,
  type DiagnosisIssue,
  type ModelAdapter,
  type ModelBackend,
  type PatchProposal,
  type RepositoryTarget,
} from "@jasonTM17/core";
import { z } from "zod";

export const repairRequestSchema = z
  .object({
    issueDescription: z.string().trim().min(1).max(4_000),
    rootPath: z.string().trim().min(1).optional(),
    allowlist: z
      .array(z.string().trim().min(1).max(260))
      .min(1)
      .max(64)
      .default(["."]),
    backend: z.enum(["fake", "openai"]).default("fake"),
    maxRetries: z.number().int().min(1).max(10).default(3),
    dryRun: z.boolean().default(false),
  })
  .strict();

export const approvalRequestSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(1_000).optional(),
  })
  .strict();

export type RepairRequest = z.infer<typeof repairRequestSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type RepairStatus =
  | "diagnosing"
  | "awaiting-approval"
  | "running"
  | "completed"
  | "rejected"
  | "failed";

export interface RepairRun {
  id: string;
  status: RepairStatus;
  createdAt: string;
  updatedAt: string;
  request: {
    issueDescription: string;
    rootPath: string;
    allowlist: string[];
    backend: ModelBackend;
    maxRetries: number;
    dryRun: boolean;
  };
  target: RepositoryTarget;
  issues: DiagnosisIssue[];
  proposal: PatchProposal | null;
  approval: Approval | null;
  result: BoundedRetryResult | null;
  explorerIterations: number;
  stopped: "max-iterations" | "done" | "error";
  error?: string;
}

export class RepairServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "RepairServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export type ModelFactory = (config: { backend: ModelBackend }) => ModelAdapter;

export interface RepairServiceOptions {
  repositoryRoot: string;
  modelFactory?: ModelFactory;
  checksToRun?: CheckCommand[];
  maxExplorerIterations?: number;
  maxStoredRuns?: number;
}

const DEFAULT_MAX_STORED_RUNS = 100;

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .slice(0, 1_000);
}

function canonicalDirectory(path: string, fieldName: string): string {
  let canonical: string;
  try {
    canonical = realpathSync(resolve(path));
  } catch {
    throw new RepairServiceError(
      400,
      "INVALID_ROOT",
      `${fieldName} must point to an existing directory.`,
    );
  }

  try {
    if (!statSync(canonical).isDirectory()) {
      throw new Error("not a directory");
    }
  } catch {
    throw new RepairServiceError(
      400,
      "INVALID_ROOT",
      `${fieldName} must point to an existing directory.`,
    );
  }

  return canonical;
}

function canonicalRootFromAncestors(start: string): string {
  let current = resolve(start);
  while (true) {
    const gitPath = join(current, ".git");
    const packagePath = join(current, "package.json");
    try {
      if (statSync(gitPath).isDirectory() || statSync(gitPath).isFile()) {
        return canonicalDirectory(current, "Repository root");
      }
    } catch {
      // Continue looking at the parent.
    }

    try {
      if (statSync(packagePath).isFile()) {
        return canonicalDirectory(current, "Repository root");
      }
    } catch {
      // Continue looking at the parent.
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return canonicalDirectory(start, "Repository root");
}

export function discoverRepositoryRoot(): string {
  const configuredRoot = process.env["REPOMEDIC_REPO_ROOT"];
  return canonicalRootFromAncestors(configuredRoot ?? process.cwd());
}

function isPathWithin(parent: string, child: string): boolean {
  const normalizedParent = normalize(parent).replace(/[\\/]$/, "");
  const normalizedChild = normalize(child);
  return (
    normalizedChild === normalizedParent ||
    normalizedChild.startsWith(`${normalizedParent}${sep}`)
  );
}

function validateAllowlist(allowlist: readonly string[]): void {
  for (const entry of allowlist) {
    const normalized = entry.replace(/\\/g, "/");
    if (
      isAbsolute(entry) ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      normalized.includes("/../") ||
      normalized.includes("\0")
    ) {
      throw new RepairServiceError(
        400,
        "INVALID_ALLOWLIST",
        "allowlist entries must be relative paths within the repository.",
      );
    }
  }
}

function now(): string {
  return new Date().toISOString();
}

function defaultModelFactory({
  backend,
}: {
  backend: ModelBackend;
}): ModelAdapter {
  if (backend === "fake") {
    return createModelAdapter({ backend, responses: ["DONE"] });
  }

  return createModelAdapter({
    backend,
    ...(process.env["REPOMEDIC_OPENAI_MODEL"]
      ? { model: process.env["REPOMEDIC_OPENAI_MODEL"] }
      : {}),
  });
}

function cloneRun(run: RepairRun): RepairRun {
  return structuredClone(run);
}

export class RepairService {
  readonly repositoryRoot: string;
  private readonly modelFactory: ModelFactory;
  private readonly checksToRun: CheckCommand[] | undefined;
  private readonly maxExplorerIterations: number;
  private readonly maxStoredRuns: number;
  private readonly runs = new Map<string, RepairRun>();

  constructor(options: RepairServiceOptions) {
    this.repositoryRoot = canonicalDirectory(
      options.repositoryRoot,
      "Repository root",
    );
    this.modelFactory = options.modelFactory ?? defaultModelFactory;
    this.checksToRun = options.checksToRun;
    this.maxExplorerIterations = options.maxExplorerIterations ?? 5;
    this.maxStoredRuns = options.maxStoredRuns ?? DEFAULT_MAX_STORED_RUNS;

    if (
      !Number.isSafeInteger(this.maxExplorerIterations) ||
      this.maxExplorerIterations < 1 ||
      this.maxExplorerIterations > 20
    ) {
      throw new Error("maxExplorerIterations must be between 1 and 20");
    }
    if (!Number.isSafeInteger(this.maxStoredRuns) || this.maxStoredRuns < 1) {
      throw new Error("maxStoredRuns must be a positive safe integer");
    }
  }

  list(): RepairRun[] {
    return [...this.runs.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneRun);
  }

  get(id: string): RepairRun {
    const run = this.runs.get(id);
    if (!run) {
      throw new RepairServiceError(
        404,
        "REPAIR_NOT_FOUND",
        "Repair run not found.",
      );
    }
    return cloneRun(run);
  }

  async create(input: RepairRequest): Promise<RepairRun> {
    const rootPath = input.rootPath
      ? canonicalDirectory(input.rootPath, "rootPath")
      : this.repositoryRoot;
    if (
      !isPathWithin(this.repositoryRoot, rootPath) ||
      rootPath !== this.repositoryRoot
    ) {
      throw new RepairServiceError(
        403,
        "ROOT_NOT_ALLOWED",
        "The API may only operate on its configured repository root.",
      );
    }
    validateAllowlist(input.allowlist);

    const createdAt = now();
    const target: RepositoryTarget = { rootPath };
    const run: RepairRun = {
      id: `repair-${randomUUID()}`,
      status: "diagnosing",
      createdAt,
      updatedAt: createdAt,
      request: {
        issueDescription: input.issueDescription,
        rootPath,
        allowlist: [...input.allowlist],
        backend: input.backend,
        maxRetries: input.maxRetries,
        dryRun: input.dryRun,
      },
      target,
      issues: [],
      proposal: null,
      approval: null,
      result: null,
      explorerIterations: 0,
      stopped: "error",
    };
    this.remember(run);

    try {
      const coordinatorResult = await runCoordinator({
        model: this.modelFactory({ backend: input.backend }),
        target,
        issueDescription: input.issueDescription,
        allowlist: input.allowlist,
        maxExplorerIterations: this.maxExplorerIterations,
      });

      run.issues = coordinatorResult.issues;
      run.proposal = coordinatorResult.proposal;
      run.explorerIterations = coordinatorResult.explorerIterations;
      run.stopped = coordinatorResult.stopped;

      if (coordinatorResult.issues.length === 0 || input.dryRun) {
        run.status = "completed";
        run.result = {
          success: true,
          attempts: 0,
          finalStatus: "no-op",
          summary:
            coordinatorResult.issues.length === 0
              ? "Diagnosis completed without actionable issues."
              : "Diagnosis completed in dry-run mode; no patch was applied.",
        };
      } else if (!coordinatorResult.proposal?.operations.length) {
        run.status = "completed";
        run.result = {
          success: true,
          attempts: 0,
          finalStatus: "no-op",
          summary: "Diagnosis found issues without actionable file operations.",
        };
      } else {
        run.status = "awaiting-approval";
      }
    } catch (error) {
      run.status = "failed";
      run.error = safeErrorMessage(error);
    }

    run.updatedAt = now();
    this.remember(run);
    return cloneRun(run);
  }

  async decide(id: string, input: ApprovalRequest): Promise<RepairRun> {
    const run = this.runs.get(id);
    if (!run) {
      throw new RepairServiceError(
        404,
        "REPAIR_NOT_FOUND",
        "Repair run not found.",
      );
    }
    if (run.status !== "awaiting-approval" || !run.proposal) {
      throw new RepairServiceError(
        409,
        "REPAIR_NOT_AWAITING_APPROVAL",
        `Repair run cannot be decided from status ${run.status}.`,
      );
    }

    const approval: Approval = {
      proposalId: run.proposal.id,
      decidedBy: "human",
      decision: input.decision,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      decidedAt: now(),
    };
    run.approval = approval;

    if (input.decision === "rejected") {
      run.status = "rejected";
      run.result = {
        success: false,
        attempts: 0,
        finalStatus: "failed",
        summary: input.reason
          ? `Human approval rejected the proposal: ${input.reason}`
          : "Human approval rejected the proposal.",
      };
      run.updatedAt = now();
      this.remember(run);
      return cloneRun(run);
    }

    run.status = "running";
    run.updatedAt = now();
    this.remember(run);

    try {
      run.result = await runBoundedRetry({
        model: this.modelFactory({ backend: run.request.backend }),
        proposal: run.proposal,
        issues: run.issues,
        approved: true,
        allowlist: run.request.allowlist,
        root: run.request.rootPath,
        maxRetries: run.request.maxRetries,
        ...(this.checksToRun !== undefined
          ? { checksToRun: this.checksToRun }
          : {}),
      });
      run.status = run.result.success ? "completed" : "failed";
    } catch (error) {
      run.status = "failed";
      run.error = safeErrorMessage(error);
    }

    run.updatedAt = now();
    this.remember(run);
    return cloneRun(run);
  }

  private remember(run: RepairRun): void {
    this.runs.set(run.id, run);
    while (this.runs.size > this.maxStoredRuns) {
      const oldest = this.runs.keys().next().value;
      if (!oldest) break;
      this.runs.delete(oldest);
    }
  }
}
