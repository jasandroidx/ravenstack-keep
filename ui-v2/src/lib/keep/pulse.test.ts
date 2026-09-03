import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { fetchKeepPulse, paperPulse } from "./pulse";

describe("KeepPulse", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    mock.restore();
  });

  it("should return paper when KEEP_PULSE_URL fails to fetch", async () => {
    global.fetch = mock(() => Promise.reject(new Error("Network Error")));
    const pulse = await fetchKeepPulse();
    expect(pulse.source).toBe("paper");
    expect(pulse.note).toBe("Network Error");
  });

  it("should return live when KEEP_PULSE_URL returns valid api data", async () => {
    const fakeData = {
      rooms: [
        { room_id: "test", name: "Test Room", occupant_agent_id: "agent1", agent_real: true, agent_state: "IDLE" }
      ],
      agents_active: 1
    };

    global.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(fakeData)
    } as any));

    const pulse = await fetchKeepPulse();
    expect(pulse.source).toBe("live");
    expect(pulse.agentsActive).toBe(1);
    expect(pulse.rooms[0].agent).toBe("agent1");
    expect(pulse.rooms[0].status).toBe("IDLE");
    expect(pulse.rooms[0].empty).toBe(false);
  });

  it("should map to paper if sot_status is offline even if base is live", async () => {
    const fakeData = {
      sot_status: "offline",
      rooms: [
        { room_id: "test", name: "Test Room", occupant_agent_id: "agent1", agent_real: false }
      ]
    };

    global.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(fakeData)
    } as any));

    const pulse = await fetchKeepPulse();
    expect(pulse.source).toBe("paper");
    // Since it's paper and agent_real is false, empty should be true (don't invent idle chips)
    expect(pulse.rooms[0].empty).toBe(true);
  });
});
