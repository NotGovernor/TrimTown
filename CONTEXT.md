# TrimTown

A Windows-first desktop app that loads one video, scrubs picture+audio, sets frame-accurate In/Out, and trims with system FFmpeg to `stem_trimmed.ext` beside the source.

## Language

Do not invent synonyms. Use these terms as written.

**Clip**
The single loaded source file. Not a queue item. A new drop replaces the current Clip immediately.

**Playhead**
Current integer frame.

**In / Out**
Inclusive start frame, exclusive end frame (half-open `[in, out)`). Duration in frames = `out - in`. Last playable frame index is `frame_count - 1`. Out defaults to `frame_count`. In defaults to `0`. **I** sets `in = playhead`. **O** sets `out = playhead + 1` (clamped to `frame_count`).

**Accurate mode**
Decode to the chosen frames; re-encode video if needed.

**Fast mode**
Stream copy; may snap to keyframes. UI frames stay what the user set.

**Preview audio**
Disposable mono sidecar for scrub/play. Never used as trim input.

**Still**
One JPEG decoded by FFmpeg for frame N. Used when HTML5 cannot decode the Clip.

## Avoid

Do not use: queue, render, export, project, timeline clip, in point as seconds.

## Example Dialogue

> **Dev:** User drops a file, then wants the cut to start at the current frame and end after the current frame. Then they hit Trim. What's the flow?

> **Domain Expert:** Drop replaces the Clip. Playhead is the current integer frame. **I** sets In to the playhead. **O** sets Out to playhead + 1, clamped to `frame_count`. Trim writes `{stem}_trimmed{ext}` beside the source using Accurate mode or Fast mode. Preview audio and Stills are for scrub/play only — never trim input.
