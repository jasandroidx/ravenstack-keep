import test from "node:test";
import assert from "node:assert";
import { isRefusal, npcOllamaTimeoutMs, talkChain, type Leg } from "./talk-chain.ts";

const okLeg = (t: string): Leg => async () => ({ ok: true, text: t });
const failLeg: Leg = async () => ({ ok: false, error: "down" });
const throwLeg: Leg = async () => { throw new Error("boom"); };
const never: Leg = async () => { throw new Error("should not be called"); };

test("Ollama answers first; FreeLLMAPI is not called", async () => {
  const r = await talkChain({ ollama: okLeg("hi from ollama"), freellmapi: never }, ["c"]);
  assert.equal(r.source, "ollama");
  assert.equal(r.text, "hi from ollama");
});

test("Ollama fails or throws -> FreeLLMAPI", async () => {
  for (const o of [failLeg, throwLeg, okLeg("   ")]) {
    const r = await talkChain({ ollama: o, freellmapi: okLeg("hi from free") }, ["c"]);
    assert.equal(r.source, "freellmapi");
    assert.equal(r.text, "hi from free");
  }
});

test("both fail -> canned line", async () => {
  const r = await talkChain({ ollama: failLeg, freellmapi: throwLeg }, ["only line"]);
  assert.equal(r.source, "canned");
  assert.equal(r.text, "only line");
  assert.deepEqual(r.tried, ["ollama:fail", "freellmapi:fail"]);
});

test("a FreeLLMAPI refusal counts as failure -> canned", async () => {
  const r = await talkChain({ ollama: failLeg, freellmapi: okLeg("I'm sorry, but I can't help with that.") }, ["sweet"]);
  assert.equal(r.source, "canned");
  assert.deepEqual(r.tried, ["ollama:fail", "freellmapi:refused"]);
});

test("refusal detector leaves in-character lines alone", () => {
  assert.ok(isRefusal("I cannot continue this conversation."));
  assert.ok(isRefusal("As an AI, I..."));
  assert.ok(!isRefusal("Sorry I'm late, love, the stairs are steep."));
  assert.ok(!isRefusal("I can't stop smiling when you walk in."));
  assert.ok(!isRefusal("I'm sorry you had such a long day. Come here."));
  assert.ok(isRefusal("I'm sorry, but I can't continue with that request."));
});

test("short Ollama timeout default, env override, floor", () => {
  assert.equal(npcOllamaTimeoutMs({}), 6000);
  assert.equal(npcOllamaTimeoutMs({ KEEP_NPC_OLLAMA_TIMEOUT_MS: "3000" }), 3000);
  assert.equal(npcOllamaTimeoutMs({ KEEP_NPC_OLLAMA_TIMEOUT_MS: "10" }), 6000);
});
