import { randomUUID } from 'node:crypto';
import type { TraceEvent, TraceEventKind } from './trace-event.js';

export class Tracer {
  private readonly sessionId: string;
  private readonly events: TraceEvent[] = [];
  private nextIndex = 0;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? randomUUID();
  }

  emit(kind: TraceEventKind, metadata: Record<string, unknown> = {}): TraceEvent {
    const event: TraceEvent = {
      index: this.nextIndex++,
      kind,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      metadata: Object.freeze({ ...metadata }),
    };
    this.events.push(event);
    return event;
  }

  getEvents(): readonly TraceEvent[] {
    return this.events;
  }

  toJSON(): string {
    return JSON.stringify(this.events, null, 2);
  }

  get sessionIdValue(): string {
    return this.sessionId;
  }
}

/** Null tracer that discards all events — used when tracing is disabled. */
export class NullTracer extends Tracer {
  override emit(kind: TraceEventKind, metadata: Record<string, unknown> = {}): TraceEvent {
    // Discard — return a valid event shape without storing it
    return {
      index: -1,
      kind,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionIdValue,
      metadata: Object.freeze(metadata),
    };
  }

  override getEvents(): readonly TraceEvent[] {
    return [];
  }
}
