# as-bump-maker (Lawgics fork)

Custom Adult Swim–style bump maker for Plex pre-rolls and server announcements (e.g. NeXroll).

Fork of [Matthunker/as-bump-maker](https://github.com/Matthunker/as-bump-maker) with full source in `web/`.

## Demo

![Demo](assets/demo.gif)

## Features

### From upstream

- Text card timeline (text + duration per card)
- Per-card text placement (presets + custom position)
- Optional background image/video (cover/contain + dim)
- Optional music upload (muxed into export)
- In-browser MP4 export (MediaRecorder when supported; otherwise WebM → MP4 via ffmpeg.wasm)

### Added in this fork

- **Per-card images** — each card can have text, an image, or both (at least one required)
- **Separate image controls** — image size (10–100%), image position (independent of text position)
- **Preview editing** — select a card, then drag text (gold outline) or image (blue outline) in the preview; drag the blue corner handle to resize the image
- **Snap guides** — green dashed lines when aligning to canvas center or the other element on the same card
- **Card reorder** — drag the grip handle on the left of each card bar
- **Validation** — empty cards show a red border and block Preview/Export until fixed
- **UI polish** — text controls grouped together, image controls at the bottom of each card; status/progress bar sits below the preview canvas (not over it)

## Planned

- Export directly to a server preroll folder (Docker volume + small upload API)
- Optional basic auth for homelab deployments

## Run from source (development)

```bash
cd web
python3 -m http.server 1234
```

Then open http://localhost:1234 in your browser.

On Windows, if `python3` is not available, try `py -m http.server 1234`.

## Run upstream Docker image

```bash
docker run --rm -p 5173:80 matthuey/as-bump-maker:latest
```

Then open http://localhost:5173 in your browser.

> The upstream image does not include this fork’s per-card image and preview-editing features. Use the `web/` source for development until a custom image is built.

## Notes

- First export may download browser-side encoder assets (ffmpeg.wasm) depending on your setup.
- Preview edit mode: click a card to select it; click elsewhere (Audio, Background, Look, etc.) to deselect.
