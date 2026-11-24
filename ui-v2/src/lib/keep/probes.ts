/**
 * Read-only probe rack. Every probe is a plain-text shell script on the box
 * at KEEP_PROBES_DIR/<name>.sh (see AGENTS.md: box paths don't exist in this
 * VM, so this reads them from an env var with the real box default), run
 * through the box's /usr/local/bin/probe wrapper so every result also lands
 * in the vault via raven-drop. See armory/README.md for the box-side scripts
 * and their deployment path.
 *
 * The allowlist IS the probes directory: whatever <name>.sh files actually
 * exist there, re-read on every call. A caller's string only ever selects a
 * name already present in that list -- it never reaches argv on its own.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";

const NAME_RE = /^[a-z0-9-]+$/;

export function getProbesDir(): string {
  return process.env.KEEP_PROBES_DIR?.trim() || "/root/ravenstack-armory/workflows/probes";
}

export function getProbeBin(): string {
  return process.env.KEEP_PROBE_BIN?.trim() || "/usr/local/bin/probe";
}

/** Every "<name>.sh" file actually present in the probes dir, sorted. Empty (never throws) if the dir is missing. */
export function listProbes(): string[] {
  try {
    return fs
      .readdirSync(getProbesDir())
      .filter((f) => f.endsWith(".sh"))
      .map((f) => f.slice(0, -3))
      .filter((name) => NAME_RE.test(name))
      .sort();
  } catch {
    return [];
  }
}

export type ProbeResult = {
  ok: boolean;
  summary: string;
  output: string;
  ranAt: string;
  error?: string;
};

/** The script's own contract: plain text ending in one `SUMMARY: OK|WARN|FAIL <reason>` line. */
function lastSummaryLine(output: string): string {
  const lines = output.trim().split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  return /^SUMMARY:\s*(OK|WARN|FAIL)\b/.test(last) ? last : "SUMMARY: WARN probe produced no SUMMARY line";
}

/**
 * Run one probe by name. `ok` reflects whether the probe actually ran (the
 * wrapper exited cleanly within the timeout) -- the health verdict itself is
 * in `summary`, parsed from the script's own last line, never invented here.
 */
export async function executeProbe(name: string): Promise<ProbeResult> {
  const ranAt = new Date().toISOString();
  const requested = name.trim();
  const canonical = listProbes().find((n) => n === requested);

  if (!NAME_RE.test(requested) || !canonical) {
    return {
      ok: false,
      summary: "SUMMARY: FAIL unknown probe",
      output: "",
      ranAt,
      error: `No such probe: ${requested || "(empty)"}`,
    };
  }

  return new Promise((resolve) => {
    execFile(getProbeBin(), [canonical], { timeout: 45000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      const output = (stdout || stderr || "").toString();
      if (err) {
        const killed = (err as NodeJS.ErrnoException & { killed?: boolean }).killed;
        const message = killed ? "Probe timed out after 45s." : err.message;
        resolve({ ok: false, summary: output ? lastSummaryLine(output) : `SUMMARY: FAIL ${message}`, output, ranAt, error: message });
        return;
      }
      resolve({ ok: true, summary: lastSummaryLine(output), output, ranAt });
    });
  });
}
