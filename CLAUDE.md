# CLAUDE.md — Ravenstack Keep

Read `AGENTS.md` in this same directory before doing anything else in this repo. It is
the mandatory first step for any agent here, including a note on what's currently broken
(vault charter docs are missing — don't pretend you've read them) and a pointer to
`ReClaw-2.0/AGENTS.md`'s **Universal to-do / open threads** section for what's deferred
fortress-wide.

This file exists because Claude Code loads `CLAUDE.md` automatically at the start of
every session in a repo — no prompt, hook, or cron needed. `ReClaw-2.0` already has one;
this repo didn't, which is exactly how a Claude Code session working here could miss the
AGENTS.md instruction entirely. Keep this file thin — it should never duplicate content,
only point at the one place that has it, so it can't itself go stale.
