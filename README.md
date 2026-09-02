# TrimTown

<p align="center">
  <img src="src-tauri/icons/icon.png" width="128" height="128" alt="TrimTown logo">
</p>

<p align="center">One clip. Mark In and Out. Trim. Frame-accurate, on the desktop.</p>

Windows, macOS, and Linux. **macOS and Linux builds are not well tested yet.**

## Install

You need **FFmpeg** (includes `ffprobe`) on your PATH, then TrimTown.

### 1. FFmpeg

**Windows** (WinGet, recommended):

```text
winget install -e --id Gyan.FFmpeg
```

Then close and reopen any terminal so PATH updates.

**macOS** (Homebrew):

```text
brew install ffmpeg
```

**Linux:**

```text
sudo apt install ffmpeg
```

(or your distro’s `ffmpeg` package)

Alternatively: [ffmpeg.org/download.html](https://ffmpeg.org/download.html).

### 2. TrimTown

Download the installer for your OS from **[Releases](https://github.com/NotGovernor/TrimTown/releases/latest)**:

| OS | File |
|----|------|
| Windows | `TrimTown_…_x64-setup.exe` (NSIS) |
| macOS | `.dmg` |
| Linux | `.AppImage` |

There is no release until maintainers tag `v0.1.0`. If that page is empty, the app is source-only for now.

**Windows SmartScreen** may say “Windows protected your PC.” That is because the installer is **unsigned**. More info → Run anyway.

**macOS Gatekeeper** may say the developer cannot be verified. Control-click the app → Open.

**Linux AppImage:** `chmod +x` the file, then run it. You may still need WebKitGTK (`libwebkit2gtk-4.1-0`) from your distro.

### 3. Verify FFmpeg inside TrimTown

Open TrimTown → gear (Settings) → **Verify**. Both FFmpeg and FFprobe should show good. If not, fix PATH or paste full paths to the binaries and Verify again.

## Accurate vs Fast

- **Accurate** (default) — decode-accurate seek. Video is re-encoded so the cut matches integer frames. Audio/subtitles/data are copied.
- **Fast** — stream copy with an input seek. In/Out marks are **not** rewritten. The file may start on the previous keyframe. Settings shows a warning when Fast is selected.

## Preview vs the cut

Preview is honest about what it can show, and it is not the trim:

- **Playable files** — the HTML5 `<video>` is the picture for play, pause, scrub, and frame-step. The playhead is the integer frame TrimTown set; do not treat `currentTime` as truth while paused.
- **Unplayable files** — FFmpeg JPEG stills (seek after decode) plus a banner. Trim still works.
- The trim always runs FFmpeg on the **source** file with Accurate or Fast as chosen.

## Develop

```text
npm install
npm run tauri dev
```

Vite is on port **1422** (HMR **1423**).

```text
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
```

Windows build prereqs (Node 20+, Rust, VS Build Tools C++ workload, WebView2) are in `AGENTS.md`.

Do not share `node_modules` between WSL and Windows.

## License

See [`LICENSE`](LICENSE). To the extent possible under law, copyright is waived (CC0); MIT and estoppel are fallbacks.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
