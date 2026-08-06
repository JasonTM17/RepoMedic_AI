import supertest from "supertest";
import { createApp } from "../src/app.js";
import { clearTasks } from "../src/task-store.js";
import { beforeEach, describe, it, expect } from "vitest";

describe("Task API known bugs", () => {
  let request: ReturnType<typeof supertest>;
  beforeEach(() => {
    clearTasks();
    request = supertest(createApp());
  });

  it("BUG1: first task should have id 1", async () => {
    const r = await request.post("/tasks").send({ title: "T" });
    expect(r.body.id).toBe(1); // will be 0 (bug)
  });
  it("BUG3: missing title should return 400", async () => {
    const r = await request.post("/tasks").send({});
    expect(r.status).toBe(400); // will be 200 (bug)
  });
  it("BUG4: creating task should return 201", async () => {
    const r = await request.post("/tasks").send({ title: "T" });
    expect(r.status).toBe(201); // will be 200 (bug)
  });
});
