# TrimTown — Agent Instructions

## Project Overview

Frame-accurate video trimmer desktop app built with **Tauri v2** (Rust backend) + **SolidJS** (frontend) + **Tailwind CSS v4**. Identifier: `com.trimtown.app`. Dev server port **1422** (HMR **1423**).

Domain language: `CONTEXT.md` (do not invent synonyms).

## Design Tokens (Tailwind Theme)

- **Gold**: `#C8B496` (primary accent)
- **Gold Light**: `#D4C4A8`
- **Gold Dark**: `#A89470`
- **Background Primary**: `#0F0F0F`
- **Background Secondary**: `#161616`
- **Background Tertiary**: `#1E1E1E`
- **Background Elevated**: `#252525`
- **Text Primary**: `#E8E8E8`
- **Text Secondary**: `#A0A0A0`
- **Text Muted**: `#6B6B6B`
- **Border**: `#2A2A2A`
- **Danger**: `#D94A4A`
- **Success**: `#34D399` (emerald-400)

## Build Commands

```bash
# Frontend dev (hot reload; port 1422, HMR 1423)
npm run dev

# Frontend production build
npm run build

# Tests
npm test

# Tauri dev (requires platform deps; Vite on 1422)
npm run tauri dev

# Tauri production build (requires platform deps)
npm run tauri build
```

## Important: Cross-Platform node_modules

**Do NOT share `node_modules` between WSL and Windows.** Native binaries (like `lightningcss`) are platform-specific.

If you switch between environments:

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
```

```bash
# WSL/Linux
rm -rf node_modules package-lock.json
npm install
```

## Windows Build Prerequisites

**Required on Windows:**

1. **Node.js** (v20+) — https://nodejs.org/
2. **Rust** (via rustup) — https://rustup.rs/
3. **Visual Studio Build Tools 2022** with:
   - "Desktop development with C++" workload
   - Windows 10/11 SDK
4. **WebView2 Runtime** — usually pre-installed on Windows 10/11

The `tauri` CLI is installed locally in `node_modules/.bin/`. Prefer `npx tauri` / `npm run tauri`.

## Conventions (load-bearing)

Do not “simplify” these away:

- `tauri` crate features: `protocol-asset` is required (`assetProtocol.enable`); `image-png` is required for `Image::from_bytes` window icon. Do not revert to `features = []`.
- Playable preview = HTML5 `<video>` for play and pause/scrub/step. Unplayable = FFmpeg JPEG stills (`-i` then `-ss`); no rAF 1× player. Stills IPC is base64, not `number[]`.
- Tauri v2 IPC from JS is **camelCase** (`startSec`, `inFrame`, `outputPath`, `newSettings`). Rust params stay snake_case.
- Settings is a **modal** over a mounted editor (`settingsOpen`). Overlay is `top-14 inset-x-0 bottom-0` (below `h-14` TopBar, `z-50`). Do not swap `EditorPage` out of the tree — that kills WebView2 picture.
- Trim-complete toast auto-dismisses at 4s; errors persist until click or `beginTrim`.
- Transport: three-zone `grid-cols-[1fr_auto_1fr]`; I/O/step/Play/Trim share `h-8`; labels `In` / `Playhead` / `Out`; Trim rightmost. (Possible overlap at 1000px min width — accepted.)
- Will use: hidden when `encoderLabel` is empty (Settings **and** Transport — no em dash). Accurate: encoder pick string. Fast: exactly `copy`. Persist settings then `describe_encoder` on CPU only **and** trim mode.
- Custom chrome: `decorations: false`, `shadow: true`. TopBar `z-[80]`: logo B + wordmark, gear, min / max-or-restore / close. ConfirmDialog `z-[90]`.
- Close while encoding: Stay/Quit confirm (`Trim in progress` / `Cancel the trim and quit?`). Quit → `cancel_trim` then close.
- Output naming **always** stacks `_trimmed` (`hero_trimmed.mp4` → `hero_trimmed_trimmed.mp4`). `start_trim` refuses input == output (`Cannot trim a file onto itself`) before taking the running slot.
- Icons = TrimTown logo B (T in a film frame). Window icon is set in `run()` setup from `icons/icon.png`. `tauri dev` must be fully quit and relaunched after icon/resource/chrome changes.
- Opener needs `opener:allow-open-path`.
- Bundle targets: `nsis`, `dmg`, `appimage`. Do not add MSI back without an issue.
- FFmpeg is **not** bundled. Discover on PATH / Settings.
