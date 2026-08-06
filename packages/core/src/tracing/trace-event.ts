export type TraceEventKind =
  | "agent.start"
  | "agent.complete"
  | "agent.error"
  | "tool.call"
  | "tool.result"
  | "workflow.start"
  | "workflow.complete"
  | "workflow.error"
  | "approval.requested"
  | "approval.received"
  | "check.start"
  | "check.complete";

export interface TraceEvent {
  /** Monotonically increasing index within this trace session. */
  readonly index: number;
  readonly kind: TraceEventKind;
  readonly timestamp: string; // ISO 8601
  readonly sessionId: string;
  /** Arbitrary key-value metadata. Values must be JSON-serializable. */
  readonly metadata: Readonly<Record<string, unknown>>;
}
