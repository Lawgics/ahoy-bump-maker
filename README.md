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

![Example output](assets/example-output.gif)

### Demo

_App walkthrough (screen recording) coming soon._

## What you can do

[ahoy] is a small browser app — no video editor to learn. You build a short announcement slide-by-slide, preview it, and download an MP4 for Plex.

- **Create a multi-part announcement** — Add cards (like slides). Each card shows for a few seconds, one after another — perfect for “hey everyone” → the news → a sign-off.
- **Use text, images, or both** — Type your message, upload a logo or photo, or combine them on the same card (e.g. your avatar + “your server admin”).
- **Control timing** — Set how long each card stays on screen. Not sure? Click the **Suggested** time under Seconds and it picks a readable length based on the card’s word and character count.
- **Style text per card** — Set a default font under **Text style**, then override font or size on individual cards (e.g. a quiet `[ahoy]` whisper on the last card).
- **Position everything visually** — Click a card, then drag text and images in the preview until the layout looks right. No coordinate math.
- **Add atmosphere (optional)** — Background image or video (with mute/loop controls), light grain, quick fades, background music — or skip all of it and keep the classic black bump look.
- **Choose output size** — **Output** sets resolution and FPS; font size scales automatically when you change resolution.
- **Preview the full video** — Hit **Preview** to watch the whole announcement before you commit.
- **Export an MP4** — One click downloads a file you can drop into Plex pre-rolls, NeXroll, or a media folder. Ready to show your users.

## Get started

Everything runs in your **web browser**. You edit on your PC; the finished MP4 goes on your Plex server. No install wizard — just open the app, make your bump, export, done.

> **Docker support is coming soon** — the easiest way to run [ahoy] on a homelab. For now, use the steps below. They work on Windows, Mac, and Linux.

### 1. Get the app on your computer

**Option A — Download (easiest if you don’t use Git)**

1. Open this repo on GitHub → green **Code** button → **Download ZIP**
2. Unzip it somewhere simple, e.g. `C:\Users\You\ahoy-bump-maker`
3. Inside that folder, open the **`web`** folder — that’s the app

**Option B — Git**

```bash
git clone https://github.com/Lawgics/ahoy-bump-maker.git
cd ahoy-bump-maker/web
```

### 2. Start the app

Open a terminal in the **`web`** folder.

**Windows (PowerShell):**

```powershell
cd C:\path\to\ahoy-bump-maker\web
py -m http.server 1234
```

**Mac / Linux:**

```bash
cd /path/to/ahoy-bump-maker/web
python3 -m http.server 1234
```

Leave that window open while you work. Open your browser to:

**http://localhost:1234**

You should see the **[ahoy]** editor.

### 3. Create your announcement

1. Click **Load example** to see a ready-made maintenance bump, or **+ Add card** to start fresh.
2. For each card:
   - Type your **Text** (or leave blank if the card is image-only)
   - Set **Seconds** (or click **Suggested: X.Xs** to apply the recommended time)
   - Optionally **Browse image** to add a picture
   - Optionally set **Font override** / **Size override** for that card only
   - Use **Text position** / **Image position** dropdowns, or click the card and **drag in the preview**
3. Use the **grip** (six dots) on a card to drag and reorder cards.
4. Optional: under **Output**, pick resolution and FPS. Under **Background** and **Audio**, add a backdrop or music. Under **Text style**, set the default font, fade, and grain.
5. Click **Preview** to watch the full timeline. Click **Stop** when done.

### 4. Export and use on Plex

1. Click **Export MP4**. Your browser downloads the video (first export may take a moment while it loads encoder files — normal).
2. Move the MP4 somewhere your Plex server can access.
3. Follow **[Using announcements on Plex](#using-announcements-on-plex)** below to set it up as a pre-roll (or use [NeXroll](https://github.com/JFLXCLOUD/NeXroll)).

**Tips:**

- Click a card to edit it. Click anywhere else (Output, Text style, Background, etc.) to deselect.
- **Mute background video sound** only affects a video backdrop — not music under **Audio**.
- Export clears the edit outlines automatically — your MP4 won’t have yellow/blue boxes.
- If **Export** is greyed out, a card is empty — add text or an image to every card.

## Using announcements on Plex

Once you’ve exported a bump from [ahoy], you need to get it in front of your users. Two main approaches:

| Method | Good for | Status |
|--------|----------|--------|
| **Pre-rolls** | Time-sensitive notices before movies | Documented below |
| **Home screen** | Longer-lived messages, browsing | Guide coming soon |

### Pre-rolls (play before movies)

Good for maintenance windows, outages, and “heads up” messages that play before a movie starts.

1. **Copy your exported MP4** somewhere your Plex server can read (local disk, NAS share, etc.).
2. **Tell Plex about it** using one of the options below.

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

## Planned

- **Docker image** — run [ahoy] with one command on your homelab (top priority for easier setup)
- Export directly to a server folder (preroll path via volume mount + upload API)
- Home screen announcement guide (collections / pinned hubs)
- Optional basic auth for homelab deployments

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

- First export may take a little longer while your browser downloads encoder files — only happens once.
