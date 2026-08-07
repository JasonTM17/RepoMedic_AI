"use client";

import {
  createApiClient,
  createRepair,
  decideRepairApproval,
  listRepairs,
  type DiagnosisIssue,
  type PatchOperation,
  type RepairRequest,
  type RepairRun,
} from "@jasonTM17/api-client";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

type Backend = "fake" | "openai";

const apiUrl =
  process.env.NEXT_PUBLIC_REPOMEDIC_API_URL ?? "http://localhost:4000";

function formatError(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  if (typeof error === "object" && error !== null && "error" in error) {
    return formatError((error as { error?: unknown }).error);
  }
  return "The API request could not be completed.";
}

function parseAllowlist(value: string): string[] {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : ["."];
}

function replaceRun(runs: RepairRun[], updated: RepairRun): RepairRun[] {
  const withoutUpdated = runs.filter((run) => run.id !== updated.id);
  return [updated, ...withoutUpdated];
}

export default function RepairDashboard() {
  const client = useMemo(() => createApiClient(apiUrl), []);
  const [issueDescription, setIssueDescription] = useState("");
  const [allowlist, setAllowlist] = useState(".");
  const [backend, setBackend] = useState<Backend>("fake");
  const [dryRun, setDryRun] = useState(false);
  const [runs, setRuns] = useState<RepairRun[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyApproval, setBusyApproval] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await listRepairs({
        client,
        throwOnError: true,
      });
      setRuns(result.data.items);
      setError(null);
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void refreshRuns();
  }, [refreshRuns]);

  const selectedRun = runs.find((run) => run.id === selectedId) ?? runs[0];

  async function submitRepair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedDescription = issueDescription.trim();
    if (!trimmedDescription) {
      setError("Describe the issue before starting a repair run.");
      return;
    }

    const body: RepairRequest = {
      issueDescription: trimmedDescription,
      allowlist: parseAllowlist(allowlist),
      backend,
      dryRun,
    };

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createRepair({
        client,
        body,
        throwOnError: true,
      });
      setRuns((current) => replaceRun(current, result.data));
      setSelectedId(result.data.id);
      setIssueDescription("");
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusyApproval(id);
    setError(null);
    try {
      const result = await decideRepairApproval({
        client,
        path: { repairId: id },
        body: { decision },
        throwOnError: true,
      });
      setRuns((current) => replaceRun(current, result.data));
    } catch (requestError) {
      setError(formatError(requestError));
    } finally {
      setBusyApproval(null);
    }
  }

  return (
    <div className="dashboard-grid">
      <section className="panel" aria-labelledby="new-run-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Start a guarded run</p>
            <h2 id="new-run-heading">Diagnose repository</h2>
          </div>
          <span className="pill">Human approval required</span>
        </div>

        <form className="repair-form" onSubmit={submitRepair}>
          <label htmlFor="issue-description">Issue description</label>
          <textarea
            id="issue-description"
            value={issueDescription}
            onChange={(event) => setIssueDescription(event.target.value)}
            placeholder="Describe the failing behavior, test, or package problem…"
            maxLength={4000}
            required
            rows={7}
          />

          <label htmlFor="allowlist">Allowed paths</label>
          <input
            id="allowlist"
            value={allowlist}
            onChange={(event) => setAllowlist(event.target.value)}
            placeholder=". or src,packages/core"
          />
          <p className="field-help">
            Comma-separated paths relative to the configured repository root.
          </p>

          <div className="form-row">
            <div>
              <label htmlFor="backend">Model backend</label>
              <select
                id="backend"
                value={backend}
                onChange={(event) => setBackend(event.target.value as Backend)}
              >
                <option value="fake">Fake · deterministic local demo</option>
                <option value="openai">OpenAI · requires API key</option>
              </select>
            </div>
            <label className="checkbox-label" htmlFor="dry-run">
              <input
                id="dry-run"
                type="checkbox"
                checked={dryRun}
                onChange={(event) => setDryRun(event.target.checked)}
              />
              Diagnosis only (dry run)
            </label>
          </div>

          <button
            className="primary-button"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Diagnosing…" : "Start diagnosis"}
          </button>
        </form>
      </section>

      <section className="panel" aria-labelledby="run-history-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Recent activity</p>
            <h2 id="run-history-heading">Repair runs</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void refreshRuns()}
            disabled={isLoading}
          >
            {isLoading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {error ? (
          <p className="alert" role="alert">
            {error}
          </p>
        ) : null}

        {isLoading && runs.length === 0 ? (
          <p className="muted">Loading local repair runs…</p>
        ) : runs.length === 0 ? (
          <p className="empty-state">
            No runs yet. Start with a concrete issue above.
          </p>
        ) : (
          <div className="run-list" role="list" aria-label="Repair run history">
            {runs.map((run) => (
              <button
                className={`run-list-item${selectedRun?.id === run.id ? " is-selected" : ""}`}
                key={run.id}
                type="button"
                onClick={() => setSelectedId(run.id)}
              >
                <span className="run-list-title">
                  {run.request.issueDescription}
                </span>
                <span className={`status status-${run.status}`}>
                  {run.status}
                </span>
                <span className="run-list-meta">
                  {run.issues.length} issue(s) · {run.request.backend}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedRun ? (
        <section
          className="panel detail-panel"
          aria-labelledby="run-detail-heading"
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Evidence review</p>
              <h2 id="run-detail-heading">Selected run</h2>
            </div>
            <span className={`status status-${selectedRun.status}`}>
              {selectedRun.status}
            </span>
          </div>

          <dl className="run-facts">
            <div>
              <dt>Run ID</dt>
              <dd>{selectedRun.id}</dd>
            </div>
            <div>
              <dt>Repository root</dt>
              <dd>{selectedRun.target.rootPath}</dd>
            </div>
            <div>
              <dt>Explorer iterations</dt>
              <dd>{selectedRun.explorerIterations}</dd>
            </div>
            <div>
              <dt>Stop reason</dt>
              <dd>{selectedRun.stopped}</dd>
            </div>
          </dl>

          <div className="evidence-block">
            <h3>Findings</h3>
            {selectedRun.issues.length === 0 ? (
              <p className="muted">No actionable issues were returned.</p>
            ) : (
              <ol className="finding-list">
                {selectedRun.issues.map((issue: DiagnosisIssue) => (
                  <li key={issue.id}>
                    <div className="finding-heading">
                      <strong>{issue.description}</strong>
                      <span className={`severity severity-${issue.severity}`}>
                        {issue.severity}
                      </span>
                    </div>
                    <p>
                      {issue.file ?? "Repository-wide finding"} ·{" "}
                      {Math.round(issue.confidence * 100)}% confidence
                    </p>
                    <ul>
                      {issue.evidence.map((evidence: string) => (
                        <li key={evidence}>{evidence}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {selectedRun.proposal ? (
            <div className="evidence-block">
              <h3>Proposed operations</h3>
              <ul className="operation-list">
                {selectedRun.proposal.operations.map(
                  (operation: PatchOperation) => (
                    <li key={operation.id}>
                      <code>{operation.kind}</code> {operation.path}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ) : null}

          {selectedRun.status === "awaiting-approval" ? (
            <div className="approval-actions" aria-live="polite">
              <p>Review the evidence before allowing any patch mutation.</p>
              <button
                className="danger-button"
                type="button"
                onClick={() => void decide(selectedRun.id, "rejected")}
                disabled={busyApproval !== null}
              >
                Reject proposal
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => void decide(selectedRun.id, "approved")}
                disabled={busyApproval !== null}
              >
                {busyApproval === selectedRun.id
                  ? "Running guarded patch…"
                  : "Approve and run patch"}
              </button>
            </div>
          ) : null}

          {selectedRun.result ? (
            <div className="result-block" aria-live="polite">
              <h3>Workflow result</h3>
              <p>
                <strong>{selectedRun.result.finalStatus}</strong> ·{" "}
                {selectedRun.result.summary}
              </p>
              <p className="muted">Attempts: {selectedRun.result.attempts}</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
