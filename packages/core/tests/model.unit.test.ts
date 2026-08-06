import { describe, it, expect } from "vitest";
import {
  FakeModelAdapter,
  FakeModelExhaustedError,
} from "../src/model/fake-model.js";
import {
  OpenAIAdapter,
  OpenAIConfigError,
} from "../src/model/openai-adapter.js";
import { createModelAdapter } from "../src/model/router.js";

describe("Model Abstraction", () => {
  describe("FakeModelAdapter", () => {
    it("returns queued responses in order", async () => {
      const model = new FakeModelAdapter(["first", "second"]);
      expect(await model.complete([])).toBe("first");
      expect(await model.complete([])).toBe("second");
    });

    it("throws FakeModelExhaustedError on empty queue", async () => {
      const model = new FakeModelAdapter(["first"]);
      await model.complete([]);
      await expect(model.complete([])).rejects.toThrow(FakeModelExhaustedError);
    });
  });

  describe("OpenAIAdapter", () => {
    it("throws OpenAIConfigError when apiKey is empty string", () => {
      expect(() => new OpenAIAdapter({ apiKey: "" })).toThrow(
        OpenAIConfigError,
      );
    });
  });

  describe("createModelAdapter", () => {
    it("creates fake adapter correctly", async () => {
      const model = createModelAdapter({
        backend: "fake",
        responses: ["hello"],
      });
      expect(model.name).toBe("fake");
      expect(await model.complete([])).toBe("hello");
    });
  });
});
