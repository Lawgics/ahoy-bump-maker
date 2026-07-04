# [ahoy] — ahoy-bump-maker

**Short announcement videos for Plex server admins.**

Create simple Adult Swim–style bump videos to tell your Plex users about maintenance windows, new features, library updates, and anything else that’s hard to broadcast over group texts, Discord, or email. Export MP4s for pre-rolls (e.g. NeXroll) or drop them into a dedicated **Announcements** library on your home screen.

## Why this exists

Self-hosted Plex admins often struggle to reach everyone on the server:

- **Group texts** expose phone numbers and are easy to mute
- **Discord** only works if every viewer actually uses it
- **Email** gets ignored or lost

Your users already open Plex to watch something. **[ahoy]** makes it easy to meet them there — a 5–10 second video that says *“Maintenance Sunday 2–4am”* or *“Watchlist now sends me a request”* without leaving the app.

## How you might use it

| Method | Good for |
|--------|----------|
| **Pre-roll** (NeXroll, etc.) | Time-sensitive notices before playback |
| **Announcements library** | Longer-lived messages, multiple clips, optional browsing |

## Demo

_App walkthrough (screen recording) coming soon._

## Example output

A finished bump from **Load example** — what your Plex users would see:

![Example output](assets/example-output.gif)

## Features

- **Per-card text and images** — each card can have text, an image, or both (at least one required)
- **Independent layout** — separate text/image position and image size (10–100%)
- **Preview editing** — drag text (gold) or image (blue) in the preview; resize images via the corner handle
- **Snap guides** — align to canvas center or the other element on the same card
- **Timeline** — multiple cards, durations, reorder via grip handle
- **Background & audio** — optional image/video background (cover/contain + dim) and music muxed on export
- **In-browser export** — MP4 via MediaRecorder or WebM → MP4 (ffmpeg.wasm)
- **Validation** — empty cards are flagged and block Preview/Export until fixed

## Planned

- Export directly to a server folder (preroll path or Announcements library via Docker volume + upload API)
- Optional basic auth for homelab deployments

## Run from source (development)

```bash
cd web
python3 -m http.server 1234
```

Then open http://localhost:1234 in your browser.

On Windows, if `python3` is not available:

```powershell
cd web
py -m http.server 1234
```

## Credits & lineage

**[ahoy]** is a fork and rebrand of [Matthunker/as-bump-maker](https://github.com/Matthunker/as-bump-maker).

The original project targets [Tunarr](https://github.com/chrisbenincasa/tunarr) and live-TV bump interstitials. Matthunker did the heavy lifting on the core bump engine, canvas rendering, and export pipeline — this project builds on that work and repurpose it for Plex server announcements.

Thanks to **Matthunker** for the original app and Docker image (`matthuey/as-bump-maker`).

To run the **upstream** image (without [ahoy] features):

```bash
docker run --rm -p 5173:80 matthuey/as-bump-maker:latest
```

Then open http://localhost:5173.

> The upstream Docker image does not include per-card images, preview drag editing, or other [ahoy]-specific features. Use this repo’s `web/` source until an [ahoy] Docker image is published.

## Notes

- First export may download browser-side encoder assets (ffmpeg.wasm) depending on your setup.
- Preview edit mode: click a card to select it; click elsewhere (Audio, Background, Look, etc.) to deselect.
