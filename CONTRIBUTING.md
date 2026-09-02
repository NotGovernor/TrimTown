# Contributing

## Before you write code

Read `AGENTS.md` and `CONTEXT.md`. Use the domain words as written (Clip, Playhead, In / Out, Accurate, Fast, Still). Do not invent synonyms (no “export”, “render”, “queue”, “project”).

## Conduct

This project uses the [Code of Adult Conduct](CODE_OF_CONDUCT.md).

## Issues

Bugs are welcome. Include:

- OS and TrimTown version (or commit)
- What you did, what you expected, what happened
- For code defects: file path and line, not a vibe

Feature ideas: open an issue first. Do not send a feature PR with no issue.

## Pull requests

- One problem per PR. No drive-by refactors.
- Tests: `npm test` and `cargo test --manifest-path src-tauri/Cargo.toml`.
- Do not add a `LICENSE` of your own, re-init the app, or retarget bundle formats without an issue.

## Releases

Maintainers tag `v*`. GitHub Actions builds Windows (NSIS), macOS (DMG), and Linux (AppImage). Do not attach binaries by hand.
