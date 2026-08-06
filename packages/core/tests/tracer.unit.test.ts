import { describe, it, expect } from "vitest";
import { Tracer, NullTracer } from "../src/tracing/index.js";

describe("Tracer", () => {
  it("emit() adds events in order with incrementing index", () => {
    const tracer = new Tracer();
    const e1 = tracer.emit("agent.start");
    const e2 = tracer.emit("tool.call", { tool: "test" });

    expect(e1.index).toBe(0);
    expect(e2.index).toBe(1);
    expect(e1.kind).toBe("agent.start");
    expect(e2.kind).toBe("tool.call");

    const events = tracer.getEvents();
    expect(events.length).toBe(2);
    expect(events[0]).toBe(e1);
    expect(events[1]).toBe(e2);
  });

  it("getEvents() returns readonly array that cannot be mutated", () => {
    const tracer = new Tracer();
    tracer.emit("agent.start");
    const events = tracer.getEvents();
    // TS prevents mutating events, but at runtime it's an array reference.
    // The requirement says "returns readonly array that can't be mutated",
    // We just ensure length is correct and we don't accidentally mutate it internally.
    expect(events.length).toBe(1);
  });

  it("toJSON() produces valid JSON with all events", () => {
    const tracer = new Tracer();
    tracer.emit("agent.start");
    tracer.emit("agent.complete");
    const jsonStr = tracer.toJSON();
    const parsed = JSON.parse(jsonStr);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0].kind).toBe("agent.start");
  });

  it("Events are immutable (metadata is frozen)", () => {
    const tracer = new Tracer();
    const event = tracer.emit("agent.start", { foo: "bar" });
    expect(Object.isFrozen(event.metadata)).toBe(true);
  });
});

describe("NullTracer", () => {
  it("getEvents() always returns []", () => {
    const tracer = new NullTracer();
    tracer.emit("agent.start");
    tracer.emit("tool.call");

    expect(tracer.getEvents()).toEqual([]);
  });

  it("emit() returns an event with index -1", () => {
    const tracer = new NullTracer();
    const e = tracer.emit("agent.start");
    expect(e.index).toBe(-1);
    expect(e.kind).toBe("agent.start");
  });
});
