import { randomUUID } from "node:crypto";
import {
  existsSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  approvalSchema,
  createModelAdapter,
  diagnosisIssueSchema,
  patchProposalSchema,
  repositoryTargetSchema,
  runBoundedRetry,
  runCoordinator,
  preparePatchProposal,
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
  | "recovery-required"
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

const boundedRetryResultSchema = z
  .object({
    success: z.boolean(),
    attempts: z.number().int().nonnegative(),
    finalStatus: z.enum([
      "applied",
      "no-op",
      "failed",
      "reverted",
      "revert-failed",
    ]),
    summary: z.string(),
  })
  .strict();

const repairRunSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum([
      "diagnosing",
      "awaiting-approval",
      "running",
      "completed",
      "rejected",
      "recovery-required",
      "failed",
    ]),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    request: z
      .object({
        issueDescription: z.string().min(1),
        rootPath: z.string().min(1),
        allowlist: z.array(z.string()),
        backend: z.enum(["fake", "openai"]),
        maxRetries: z.number().int().positive(),
        dryRun: z.boolean(),
      })
      .strict(),
    target: repositoryTargetSchema,
    issues: z.array(diagnosisIssueSchema),
    proposal: patchProposalSchema.nullable(),
    approval: approvalSchema.nullable(),
    result: boundedRetryResultSchema.nullable(),
    explorerIterations: z.number().int().nonnegative(),
    stopped: z.enum(["max-iterations", "done", "error"]),
    error: z.string().optional(),
  })
  .strict();

const persistedRepairStateSchema = z
  .object({
    version: z.literal(1),
    repositoryRoot: z.string().min(1),
    runs: z.array(repairRunSchema),
  })
  .strict();

const REPAIR_STORE_LOCK_STALE_MS = 5 * 60 * 1_000;

export interface RepairRunStore {
  load(): RepairRun[];
  save(runs: readonly RepairRun[]): void;
  getRecoveryWarning?(): string | undefined;
}

export class MemoryRepairRunStore implements RepairRunStore {
  private runs: RepairRun[] = [];

  load(): RepairRun[] {
    return structuredClone(this.runs);
  }

  save(runs: readonly RepairRun[]): void {
    this.runs = structuredClone([...runs]);
  }
}

export interface FileRepairRunStoreOptions {
  dataDir: string;
  repositoryRoot: string;
}

/**
 * Durable local store for repair evidence. Writes use a temporary file and a
 * same-directory rename so a process interruption cannot leave a half JSON
 * document as the active state.
 */
export class FileRepairRunStore implements RepairRunStore {
  readonly dataDir: string;
  readonly filePath: string;
  readonly lockPath: string;
  private readonly repositoryRoot: string;
  private baselineRuns: RepairRun[] = [];
  private recoveryWarning: string | undefined;

  constructor(options: FileRepairRunStoreOptions) {
    this.dataDir = resolve(options.dataDir);
    const relativeDataDir = relative(
      resolve(options.repositoryRoot),
      this.dataDir,
    ).replace(/\\/g, "/");
    const comparableRelativeDataDir =
      process.platform === "win32"
        ? relativeDataDir.toLowerCase()
        : relativeDataDir;
    if (
      isPathWithin(resolve(options.repositoryRoot), this.dataDir) &&
      comparableRelativeDataDir !== ".repomedic" &&
      !comparableRelativeDataDir.startsWith(".repomedic/")
    ) {
      throw new Error(
        "Repair store dataDir inside the repository must be under .repomedic so agents cannot read its state.",
      );
    }
    this.filePath = join(this.dataDir, "repair-runs.v1.json");
    this.lockPath = join(this.dataDir, "repair-runs.v1.lock");
    this.repositoryRoot = options.repositoryRoot;
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
  }

  load(): RepairRun[] {
    try {
      const runs = this.readPersistedRuns();
      this.baselineRuns = structuredClone(runs);
      return structuredClone(runs);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const quarantinePath = this.quarantineState();
      this.recoveryWarning = quarantinePath
        ? `Repair store recovery is required: ${reason} The invalid state was quarantined at ${quarantinePath}.`
        : `Repair store recovery is required: ${reason} The invalid state could not be quarantined; no mutations are allowed until it is inspected.`;
      this.baselineRuns = [];
      return [];
    }
  }

  getRecoveryWarning(): string | undefined {
    return this.recoveryWarning;
  }

  save(runs: readonly RepairRun[]): void {
    if (this.recoveryWarning !== undefined) {
      throw new Error(this.recoveryWarning);
    }

    let lockDescriptor: number | undefined;
    let temporaryPath: string | undefined;
    try {
      lockDescriptor = this.acquireLock();
      let currentRuns: RepairRun[];
      try {
        currentRuns = this.readPersistedRuns();
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const quarantinePath = this.quarantineState();
        this.recoveryWarning = quarantinePath
          ? `Repair store recovery is required: ${reason} The invalid state was quarantined at ${quarantinePath}.`
          : `Repair store recovery is required: ${reason} The invalid state could not be quarantined; no mutations are allowed until it is inspected.`;
        throw new Error(this.recoveryWarning);
      }

      const mergedRuns = mergeRepairRunSnapshots(
        this.baselineRuns,
        currentRuns,
        runs,
      );
      temporaryPath = join(
        this.dataDir,
        `.repair-runs.${process.pid}.${randomUUID()}.tmp`,
      );
      const state = JSON.stringify(
        {
          version: 1,
          repositoryRoot: this.repositoryRoot,
          runs: mergedRuns,
        },
        null,
        2,
      );

      writeFileSync(temporaryPath, `${state}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      const descriptor = openSync(temporaryPath, "r+");
      try {
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      renameSync(temporaryPath, this.filePath);
      syncDirectory(this.dataDir);
      this.baselineRuns = structuredClone(mergedRuns);
    } catch (error) {
      if (temporaryPath !== undefined) {
        try {
          unlinkSync(temporaryPath);
        } catch {
          // Preserve the original persistence error.
        }
      }
      throw new Error(
        `Unable to persist the repair store: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (lockDescriptor !== undefined) this.releaseLock(lockDescriptor);
    }
  }

  private readPersistedRuns(): RepairRun[] {
    if (!existsSync(this.filePath)) return [];

    let raw: string;
    try {
      raw = readFileSync(this.filePath, "utf8");
    } catch (error) {
      throw new Error(
        `Unable to read the repair store: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error(`Repair store ${this.filePath} is not valid JSON.`);
    }

    const state = persistedRepairStateSchema.safeParse(parsed);
    if (!state.success) {
      throw new Error(
        `Repair store ${this.filePath} failed schema validation.`,
      );
    }
    if (resolve(state.data.repositoryRoot) !== resolve(this.repositoryRoot)) {
      throw new Error(
        `Repair store ${this.filePath} belongs to a different repository root.`,
      );
    }

    return state.data.runs.map((run) => {
      const { error, ...withoutError } = run;
      return error === undefined ? withoutError : { ...withoutError, error };
    });
  }

  private quarantineState(): string | undefined {
    if (!existsSync(this.filePath)) return undefined;
    const quarantinePath = join(
      this.dataDir,
      `repair-runs.v1.corrupt.${Date.now()}.${randomUUID()}.json`,
    );
    try {
      renameSync(this.filePath, quarantinePath);
      return quarantinePath;
    } catch {
      return undefined;
    }
  }

  private acquireLock(): number {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const descriptor = openSync(this.lockPath, "wx", 0o600);
        try {
          writeFileSync(
            descriptor,
            JSON.stringify({ pid: process.pid, acquiredAt: now() }),
            "utf8",
          );
          fsyncSync(descriptor);
        } catch (error) {
          closeSync(descriptor);
          unlinkSync(this.lockPath);
          throw error;
        }
        return descriptor;
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code)
            : undefined;
        if (code === "EEXIST" && this.removeStaleLock()) continue;
        if (code === "EEXIST") {
          throw new Error(
            `Repair store is locked by another process: ${this.lockPath}.`,
          );
        }
        throw error;
      }
    }

    throw new Error(`Unable to acquire repair store lock: ${this.lockPath}.`);
  }

  private removeStaleLock(): boolean {
    let modifiedAt: number;
    try {
      modifiedAt = statSync(this.lockPath).mtimeMs;
    } catch {
      return false;
    }
    if (Date.now() - modifiedAt < REPAIR_STORE_LOCK_STALE_MS) return false;

    let pid: number | undefined;
    try {
      const lock = JSON.parse(readFileSync(this.lockPath, "utf8")) as {
        pid?: unknown;
      };
      if (typeof lock.pid === "number" && Number.isSafeInteger(lock.pid)) {
        pid = lock.pid;
      }
    } catch {
      // An old malformed lock can be removed after the stale interval.
    }

    if (pid !== undefined) {
      try {
        process.kill(pid, 0);
        return false;
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code)
            : undefined;
        if (code !== "ESRCH") return false;
      }
    }

    try {
      unlinkSync(this.lockPath);
      return true;
    } catch {
      return false;
    }
  }

  private releaseLock(descriptor: number): void {
    let closeError: unknown;
    try {
      closeSync(descriptor);
    } catch (error) {
      closeError = error;
    }

    let unlinkError: unknown;
    try {
      unlinkSync(this.lockPath);
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : undefined;
      if (code !== "ENOENT") unlinkError = error;
    }

    if (closeError !== undefined) throw closeError;
    if (unlinkError !== undefined) throw unlinkError;
  }
}

function sameRepairRun(left: RepairRun, right: RepairRun): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeRepairRunSnapshots(
  baselineRuns: readonly RepairRun[],
  currentRuns: readonly RepairRun[],
  incomingRuns: readonly RepairRun[],
): RepairRun[] {
  const baseline = new Map(baselineRuns.map((run) => [run.id, run]));
  const current = new Map(currentRuns.map((run) => [run.id, run]));
  const incoming = new Map(incomingRuns.map((run) => [run.id, run]));
  const merged = new Map(current);

  for (const [id, baselineRun] of baseline) {
    const incomingRun = incoming.get(id);
    const currentRun = current.get(id);
    if (incomingRun === undefined) {
      if (currentRun === undefined || sameRepairRun(currentRun, baselineRun)) {
        merged.delete(id);
      }
      continue;
    }
    if (!sameRepairRun(incomingRun, baselineRun)) merged.set(id, incomingRun);
  }

  for (const [id, incomingRun] of incoming) {
    if (!baseline.has(id)) merged.set(id, incomingRun);
  }

  return [...merged.values()];
}

function syncDirectory(directory: string): void {
  if (process.platform === "win32") return;
  let descriptor: number | undefined;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } catch {
    // Directory fsync is not supported by every filesystem; the file fsync
    // and atomic rename still provide the portable durability boundary.
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
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
  store?: RepairRunStore;
  dataDir?: string;
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

  // Prefer the nearest git root. Workspace packages may have their own
  // package.json files, but they are not independent repository targets.
  while (true) {
    const gitPath = join(current, ".git");
    try {
      if (statSync(gitPath).isDirectory() || statSync(gitPath).isFile()) {
        return canonicalDirectory(current, "Repository root");
      }
    } catch {
      // Continue looking at the parent.
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // A non-git source tree can still be discovered from its nearest package
  // manifest as a conservative fallback.
  current = resolve(start);
  while (true) {
    const packagePath = join(current, "package.json");

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

export function discoverRepositoryRoot(start = process.cwd()): string {
  const configuredRoot = process.env["REPOMEDIC_REPO_ROOT"];
  return configuredRoot === undefined
    ? canonicalRootFromAncestors(start)
    : canonicalDirectory(configuredRoot, "Configured repository root");
}

function isPathWithin(parent: string, child: string): boolean {
  const comparable = (value: string) =>
    process.platform === "win32" ? value.toLowerCase() : value;
  const normalizedParent = comparable(normalize(parent).replace(/[\\/]$/, ""));
  const normalizedChild = comparable(normalize(child));
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

function recoverInterruptedRun(run: RepairRun): RepairRun {
  if (run.status !== "diagnosing" && run.status !== "running") {
    return run;
  }

  return {
    ...run,
    status: "recovery-required",
    updatedAt: now(),
    error:
      "Repair run interrupted because the API restarted before completion; operator recovery is required before any further mutation.",
    result: {
      success: false,
      attempts: 0,
      finalStatus: "failed",
      summary:
        "The API restarted while this repair run was in progress. Inspect the worktree and decide recovery manually; no automatic continuation is allowed.",
    },
  };
}

export class RepairService {
  readonly repositoryRoot: string;
  private readonly modelFactory: ModelFactory;
  private readonly checksToRun: CheckCommand[] | undefined;
  private readonly maxExplorerIterations: number;
  private readonly maxStoredRuns: number;
  private readonly store: RepairRunStore;
  private readonly initialPersistenceWarning: string | undefined;
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

    this.store =
      options.store ??
      new FileRepairRunStore({
        dataDir: options.dataDir
          ? isAbsolute(options.dataDir)
            ? options.dataDir
            : join(this.repositoryRoot, options.dataDir)
          : join(this.repositoryRoot, ".repomedic"),
        repositoryRoot: this.repositoryRoot,
      });

    const loadedRuns = this.store.load();
    this.initialPersistenceWarning = this.store.getRecoveryWarning?.();
    const recoveredRuns = loadedRuns.map(recoverInterruptedRun);
    for (const run of recoveredRuns) this.runs.set(run.id, run);
    this.trimRuns();
    if (
      recoveredRuns.length !== this.runs.size ||
      recoveredRuns.some(
        (run, index) =>
          run.status !== loadedRuns[index]?.status ||
          run.updatedAt !== loadedRuns[index]?.updatedAt ||
          run.error !== loadedRuns[index]?.error,
      )
    ) {
      this.persist();
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
    this.assertPersistenceReady();
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
      const model = this.modelFactory({ backend: input.backend });
      const coordinatorResult = await runCoordinator({
        model,
        target,
        issueDescription: input.issueDescription,
        allowlist: input.allowlist,
        maxExplorerIterations: this.maxExplorerIterations,
      });

      run.issues = coordinatorResult.issues;
      run.proposal = coordinatorResult.proposal?.operations.length
        ? coordinatorResult.proposal
        : null;
      run.explorerIterations = coordinatorResult.explorerIterations;
      run.stopped = coordinatorResult.stopped;

      if (
        run.proposal &&
        coordinatorResult.issues.length > 0 &&
        !input.dryRun
      ) {
        const candidate = await preparePatchProposal({
          model,
          proposal: run.proposal,
          issues: run.issues,
          allowlist: input.allowlist,
          root: rootPath,
        });
        if (!candidate.success || !candidate.proposal) {
          throw new Error(
            candidate.error ??
              "Patch author did not produce a valid immutable candidate.",
          );
        }
        run.proposal = candidate.proposal;
      }

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
      } else if (!run.proposal) {
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
    this.assertPersistenceReady();
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
    this.trimRuns();
    this.persist();
  }

  private trimRuns(): void {
    while (this.runs.size > this.maxStoredRuns) {
      const oldest = this.runs.keys().next().value;
      if (!oldest) break;
      this.runs.delete(oldest);
    }
  }

  private persist(): void {
    this.store.save([...this.runs.values()]);
  }

  get persistenceWarning(): string | undefined {
    return this.store.getRecoveryWarning?.() ?? this.initialPersistenceWarning;
  }

  private assertPersistenceReady(): void {
    if (this.persistenceWarning === undefined) return;
    throw new RepairServiceError(
      503,
      "PERSISTENCE_RECOVERY_REQUIRED",
      this.persistenceWarning,
    );
  }
}
