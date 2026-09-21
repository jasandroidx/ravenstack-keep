import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { fetchNpcDialogue, fetchAmbientEvent } from "./ollama.ts";

describe("ollama frontend client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetchNpcDialogue returns reply when Ollama returns success", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          source: "ollama",
          reply: "The Keep stands vigilant.",
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const reply = await fetchNpcDialogue("raziel", "What is live?");
    assert.strictEqual(reply, "The Keep stands vigilant.");
  });

  test("fetchNpcDialogue returns null on fetch network error", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Network error");
    }) as typeof fetch;

    const reply = await fetchNpcDialogue("raziel", "What is live?");
    assert.strictEqual(reply, null);
  });

  test("fetchNpcDialogue returns null when endpoint returns ok: false", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          source: "fallback",
          reply: null,
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const reply = await fetchNpcDialogue("raziel");
    assert.strictEqual(reply, null);
  });

  test("fetchAmbientEvent returns event line when Ollama returns success", async () => {
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          source: "ollama",
          event: "A torch gutters in the east hallway.",
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const event = await fetchAmbientEvent();
    assert.strictEqual(event, "A torch gutters in the east hallway.");
  });

  test("fetchAmbientEvent returns null when request fails", async () => {
    globalThis.fetch = (async () => {
      return new Response("Internal Error", { status: 500 });
    }) as typeof fetch;

    const event = await fetchAmbientEvent();
    assert.strictEqual(event, null);
  });
});
