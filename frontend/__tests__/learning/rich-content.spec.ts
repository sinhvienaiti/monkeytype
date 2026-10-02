import { describe, expect, it, vi } from "vitest";
import { createRichEnglishContentClient } from "../../src/ts/learning/rich-content";

function response(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

describe("Rich English content adapter", () => {
  it("loads bounded sentence shards and converts published cloze records", async () => {
    const fetcher = vi.fn(async (input: string) => {
      if (input.endsWith("/sentences/manifest.json")) {
        return response({
          schemaVersion: 1,
          contentVersion: "2026.10.0",
          dataset: "sentences",
          count: 2,
          shards: [
            { id: "examples-000", path: "examples/000.json", count: 1 },
            { id: "exercises-000", path: "exercises/000.json", count: 1 },
          ],
        });
      }
      if (input.endsWith("/sentences/examples/000.json")) {
        return response({
          schemaVersion: 1,
          records: [{
            schemaVersion: 1,
            id: "sent.00000001",
            text: "She takes the bus every morning.",
            cefr: "A1",
            grammarIds: ["gr.a1.present-simple-routines"],
          }],
        });
      }
      if (input.endsWith("/sentences/exercises/000.json")) {
        return response({
          schemaVersion: 1,
          records: [{
            schemaVersion: 1,
            id: "ex.cloze.00000001",
            type: "cloze",
            prompt: "She ___ the bus every morning.",
            targetIds: ["gr.a1.present-simple-routines"],
            acceptedAnswers: ["takes"],
            sourceSentenceIds: ["sent.00000001"],
            cefr: "A1",
          }],
        });
      }
      throw new Error("Unexpected request: " + input);
    });

    const client = createRichEnglishContentClient({ fetcher });
    const exercises = await client.loadPublishedContextClozeExercises("A1", 8);

    expect(exercises).toHaveLength(1);
    expect(exercises[0]).toMatchObject({
      id: "ex.cloze.00000001",
      sentence: "She takes the bus every morning.",
      target: "takes",
      entityId: "gr.a1.present-simple-routines",
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("converts published sentence-building records", async () => {
    const fetcher = vi.fn(async (input: string) => {
      if (input.endsWith("/sentences/manifest.json")) {
        return response({
          schemaVersion: 1,
          contentVersion: "2026.10.0",
          dataset: "sentences",
          count: 1,
          shards: [{ id: "exercises-000", path: "exercises/000.json", count: 1 }],
        });
      }
      return response({
        schemaVersion: 1,
        records: [{
          schemaVersion: 1,
          id: "ex.building.00000001",
          type: "sentence-building",
          prompt: "Build the sentence.",
          targetIds: ["gr.a1.basic-word-order"],
          acceptedAnswers: ["I work at home."],
          sourceSentenceIds: ["sent.00000009"],
          cefr: "A1",
        }],
      });
    });
    const client = createRichEnglishContentClient({ fetcher });
    await expect(client.loadPublishedSentenceBuilderExercise()).resolves.toMatchObject({
      sentenceId: "sent.00000009",
      grammarId: "gr.a1.basic-word-order",
      acceptedAnswers: ["I work at home."],
      difficulty: "normal",
    });
  });

  it("returns empty data for an empty published manifest", async () => {
    const fetcher = vi.fn(async () =>
      response({
        schemaVersion: 1,
        contentVersion: "2026.10.0",
        dataset: "sentences",
        count: 0,
        shards: [],
      }),
    );
    const client = createRichEnglishContentClient({ fetcher });
    await expect(client.loadPublishedContextClozeExercises("A1", 8)).resolves.toEqual([]);
    await expect(client.loadPublishedSentenceBuilderExercise()).resolves.toBeNull();
  });
});
