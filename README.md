# [ahoy] — ahoy-bump-maker

**Short announcement videos for Plex server admins.**

## Why this exists

Self-hosted Plex admins often struggle to reach everyone on the server:

- **Group texts** expose phone numbers and are easy to mute
- **Discord** only works if every viewer actually uses it
- **Email** gets ignored or lost

Your users already open Plex to watch something. **[ahoy]** lets you meet them there — create simple Adult Swim–style bump videos for maintenance windows, new features, library updates, and anything else that’s awkward to broadcast elsewhere. Export an MP4 and deliver it on Plex as a **pre-roll** or (coming soon) a pinned **home screen** collection.

## See it in action

### Example output

A finished bump from **Load example** — what your Plex users would see:

![Example output](assets/example-output.gif)

### Demo

_App walkthrough (screen recording) coming soon._

## Features

- **Per-card text and images** — each card can have text, an image, or both (at least one required)
- **Independent layout** — separate text/image position and image size (10–100%)
- **Preview editing** — drag text (gold) or image (blue) in the preview; resize images via the corner handle
- **Snap guides** — align to canvas center or the other element on the same card
- **Timeline** — multiple cards, durations, reorder via grip handle
- **Suggested duration** — click the suggested time to match card length to your text
- **Background & audio** — optional image/video background (cover/contain + dim) and music muxed on export
- **In-browser export** — MP4 via MediaRecorder or WebM → MP4 (ffmpeg.wasm)
- **Validation** — empty cards are flagged and block Preview/Export until fixed

## Using announcements on Plex

Once you’ve exported a bump from [ahoy], you need to get it in front of your users. Two main approaches:

| Method | Good for | Status |
|--------|----------|--------|
| **Pre-rolls** | Time-sensitive notices before movies | Documented below |
| **Home screen** | Longer-lived messages, browsing | Guide coming soon |

### Pre-rolls (play before movies)

Good for maintenance windows, outages, and “heads up” messages that play before a movie starts.

1. **Create and export** your bump in [ahoy] (**Export MP4**).
2. **Copy the MP4** somewhere your Plex server can read (local disk, NAS share, etc.).
3. **Tell Plex about it** using one of the options below.

#### Option A — Plex built-in pre-rolls

In **Plex Web App**, open your server → click the **Settings** wrench → **Settings** → **Server** → **Extras**.

Under **Movie pre-roll video**, enter the **full path** to your exported file, for example:

```
/mnt/user/media/prerolls/maintenance.mp4
```

Plex docs: [Extras (pre-rolls & Cinema Trailers)](https://support.plex.tv/articles/202920803-extras/)

**Multiple pre-rolls:**

- **Comma** — play all listed videos in order: `preroll-1.mp4,preroll-2.mp4`
- **Semicolon** — pick one at random: `preroll-1.mp4;preroll-2.mp4`

Do not add spaces around the separators.

#### Option B — [NeXroll](https://github.com/JFLXCLOUD/NeXroll) (recommended for ongoing use)

[NeXroll](https://github.com/JFLXCLOUD/NeXroll) is a preroll manager for Plex (and Jellyfin/Emby). Upload bumps, organize them, schedule which play when, and apply paths to Plex from a web UI — handy if you rotate announcements or run more than one pre-roll.

#### Important — your users must have Cinema Trailers enabled

Pre-rolls only play when Cinema Trailers is turned on. From Plex’s docs:

> In order to have the “pre-roll” video(s) played, users will need to have the Cinema Trailers feature enabled in their Plex App. The **Enable Cinema Trailers** advanced library setting must also be enabled for the library.

So: server path configured ✓ is not enough — each viewer needs Cinema Trailers on in their client **and** in that library’s advanced settings. Worth mentioning to your users when you roll out announcements.

### On your home screen (coming soon)

We’re working on docs for surfacing announcements on the Plex home page — e.g. a pinned **collection** or playlist (possibly with tools like [Maintainerr](https://github.com/Maintainerr/Maintainerr) or [Agregarr](https://github.com/agregarr/agregarr)) instead of a full separate library. Step-by-step guide TBD.

## Run the app

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

## Planned

- Export directly to a server folder (preroll path or home screen library via Docker volume + upload API)
- Optional basic auth for homelab deployments
- [ahoy] Docker image
- Home screen announcement guide

## Credits & lineage

**[ahoy]** is a fork and rebrand of [Matthunker/as-bump-maker](https://github.com/Matthunker/as-bump-maker).

The original project targets [Tunarr](https://github.com/chrisbenincasa/tunarr) and live-TV bump interstitials. Matthunker did the heavy lifting on the core bump engine, canvas rendering, and export pipeline — this project builds on that work and repurposes it for Plex server announcements.

Thanks to **Matthunker** for the original app and Docker image (`matthuey/as-bump-maker`).

To run the **upstream** image (without [ahoy] features):

```bash
docker run --rm -p 5173:80 matthuey/as-bump-maker:latest
```

Then open http://localhost:5173.

> The upstream Docker image does not include per-card images, preview drag editing, or other [ahoy]-specific features. Use this repo’s `web/` source until an [ahoy] Docker image is published.

## Notes

- First export may download browser-side encoder assets (ffmpeg.wasm) depending on your setup.
- Click a card to edit; click elsewhere (Audio, Background, Look, etc.) to deselect.
- Export automatically deselects cards so edit outlines don’t appear in the final video.
