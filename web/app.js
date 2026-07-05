const $ = (sel) => document.querySelector(sel);

const canvas = $('#canvas');
const ctx = canvas.getContext('2d', { alpha: false });

const cardsEl = $('#cards');
const statusLine = $('#statusLine');
const logEl = $('#log'); // hidden in HTML (ok)
const progressBar = $('#progressBar');
const metaDuration = $('#metaDuration');

const btnPreview = $('#btnPreview');
const btnStop = $('#btnStop');
const btnExport = $('#btnExport');
const btnAdd = $('#btnAdd');
const btnLoadExample = $('#btnLoadExample');
const btnClear = $('#btnClear');

const audioFile = $('#audioFile');
const audioPlayer = $('#audioPlayer');
const downloadLink = $('#downloadLink');
const resultVideo = $('#resultVideo');

const bgFile = $('#bgFile');
const bgFitEl = $('#bgFit');
const bgDimEl = $('#bgDim'); // Opacity
const bgMutePreviewEl = $('#bgMutePreview');
const bgLoopEl = $('#bgLoop');

const resolutionSel = $('#resolution');
const fpsSel = $('#fps');
const fontFamilyEl = $('#fontFamily');
const fontSizeEl = $('#fontSize');
const enableFadeEl = $('#enableFade');
const enableGrainEl = $('#enableGrain');
const previewFrame = $('#previewFrame');

const PRESET_OPTIONS = `
  <option value="top-left">Top Left</option>
  <option value="top">Top</option>
  <option value="top-right">Top Right</option>
  <option value="left">Left</option>
  <option value="center">Center</option>
  <option value="right">Right</option>
  <option value="bottom-left">Bottom Left</option>
  <option value="bottom">Bottom</option>
  <option value="bottom-right">Bottom Right</option>
  <option value="custom">Custom (dragged)</option>
`;

/* ✅ autosize textarea helper */
function autosizeTA(ta){
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

// --- Per-card position helpers ---
function getCardPos(card) {
  const p = card?.pos || {};
  return {
    preset: p.preset || 'center',
    x: typeof p.x === 'number' ? p.x : 0.5,
    y: typeof p.y === 'number' ? p.y : 0.5,
    dvd: typeof p.dvd === 'boolean' ? p.dvd : false,
  };
}

function presetToAnchor(preset) {
  switch (preset) {
    case 'top-left':     return { ax: 0.08, ay: 0.12, align: 'left',  v: 'top' };
    case 'top':          return { ax: 0.50, ay: 0.12, align: 'center',v: 'top' };
    case 'top-right':    return { ax: 0.92, ay: 0.12, align: 'right', v: 'top' };
    case 'left':         return { ax: 0.08, ay: 0.50, align: 'left',  v: 'middle' };
    case 'center':       return { ax: 0.50, ay: 0.50, align: 'center',v: 'middle' };
    case 'right':        return { ax: 0.92, ay: 0.50, align: 'right', v: 'middle' };
    case 'bottom-left':  return { ax: 0.08, ay: 0.88, align: 'left',  v: 'bottom' };
    case 'bottom':       return { ax: 0.50, ay: 0.88, align: 'center',v: 'bottom' };
    case 'bottom-right': return { ax: 0.92, ay: 0.88, align: 'right', v: 'bottom' };
    default:             return { ax: 0.50, ay: 0.50, align: 'center',v: 'middle' };
  }
}

function applyPresetToPos(pos, preset) {
  if (preset === 'custom') {
    pos.preset = 'custom';
    return;
  }
  const a = presetToAnchor(preset);
  pos.preset = preset;
  pos.x = a.ax;
  pos.y = a.ay;
}

function getImagePos(card) {
  const p = card?.image?.pos || {};
  return {
    preset: p.preset || 'center',
    x: typeof p.x === 'number' ? p.x : 0.5,
    y: typeof p.y === 'number' ? p.y : 0.5,
  };
}

function getImageScalePct(card) {
  return clamp(Number(card?.image?.scale ?? 65), 10, 100);
}

function getEditTimeForCard(idx) {
  let t = 0;
  for (let i = 0; i < idx; i++) t += Number(cards[i].duration) || 0;
  return t + 0.05;
}

function getIdlePreviewCardIndex() {
  if (selectedCardIndex != null && cards[selectedCardIndex]) return selectedCardIndex;
  if (
    lastSelectedCardIndex != null &&
    lastSelectedCardIndex >= 0 &&
    lastSelectedCardIndex < cards.length
  ) return lastSelectedCardIndex;
  return cards.length ? 0 : -1;
}

function getIdlePreviewTime() {
  const idx = getIdlePreviewCardIndex();
  return idx < 0 ? 0 : getEditTimeForCard(idx);
}

function adjustCardIndexAfterRemoval(idx, removedAt) {
  if (idx == null) return null;
  if (!cards.length) return null;
  if (idx >= cards.length) return cards.length - 1;
  if (removedAt < idx) return idx - 1;
  return idx;
}

function adjustCardIndexAfterReorder(idx, fromIdx, toIdx) {
  if (idx == null) return null;
  if (idx === fromIdx) return toIdx;
  if (fromIdx < idx && toIdx >= idx) return idx - 1;
  if (fromIdx > idx && toIdx <= idx) return idx + 1;
  return idx;
}

function deselectCard() {
  if (selectedCardIndex == null) return;
  lastSelectedCardIndex = selectedCardIndex;
  selectedCardIndex = null;
  editDrag = null;
  snapGuides = { vertical: null, horizontal: null };
  renderCardsUI();
  if (!isPreviewing) {
    refreshEditView();
    setStatus('Ready. Click a card to edit.');
  }
}

function setSelectedCard(idx) {
  if (!Number.isFinite(idx) || idx < 0 || idx >= cards.length) return;
  selectedCardIndex = idx;
  lastSelectedCardIndex = idx;
  renderCardsUI();
  if (!isPreviewing) {
    refreshEditView();
    setStatus(`Editing card ${idx + 1}. Drag text or image in the preview.`);
  }
}

function refreshEditView() {
  if (isPreviewing) return;
  canvas.classList.remove('editMode');
  if (selectedCardIndex == null || !cards[selectedCardIndex]) {
    drawFrame(getIdlePreviewTime());
    return;
  }
  canvas.classList.add('editMode');
  drawFrame(getEditTimeForCard(selectedCardIndex));
}

// Global DVD bounce state
const dvdState = {
  init: false,
  x: 0, y: 0,
  vx: 240, vy: 185,
  lastT: 0,
  lastWasDvd: false,
};

// Background state
let bg = { type: 'none', url: null, el: null };

function drawCoverOrContain(mediaW, mediaH, canvasW, canvasH, mode) {
  const scale = (mode === 'contain')
    ? Math.min(canvasW / mediaW, canvasH / mediaH)
    : Math.max(canvasW / mediaW, canvasH / mediaH);

  const w = mediaW * scale;
  const h = mediaH * scale;
  const x = (canvasW - w) / 2;
  const y = (canvasH - h) / 2;
  return { x, y, w, h };
}

function getBgOpacity01() {
  const v = Number(bgDimEl?.value ?? 0);
  return clamp(v / 100, 0, 1);
}

// Card timeline (populated on load via loadExampleCards)
let cards = [];

let isPreviewing = false;
let isExporting = false;
let rafId = null;
let previewStartMs = 0;
let selectedCardIndex = 0;
let lastSelectedCardIndex = 0;
let editDrag = null;
let snapGuides = { vertical: null, horizontal: null };

const SNAP_THRESHOLD_RATIO = 1 / 120;

let ffmpeg = null;
let ffmpegLoaded = false;

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

/** Suggested on-screen time from text length (~145 wpm, AS-style pacing). */
function suggestCardDuration(card) {
  const text = (card?.text || '').trim();
  if (!text) return card?.image?.el ? 3.0 : 2.0;

  const words = text.split(/\s+/).filter(Boolean).length;
  const chars = text.length;
  const fromWords = (words / 145) * 60;
  const fromChars = chars / 14;
  let seconds = Math.max(fromWords, fromChars) + 0.5;
  if (card?.image?.el) seconds += 0.75;
  seconds = clamp(seconds, 2.0, 8.0);
  return Math.round(seconds * 2) / 2;
}

function setStatus(msg) { statusLine.textContent = msg; }

function log(msg) {
  if (!logEl) return;
  logEl.textContent = (logEl.textContent + msg + '\n').slice(-6000);
  logEl.scrollTop = logEl.scrollHeight;
}

function setProgress(p01) {
  const v = clamp(p01, 0, 1);
  progressBar.style.width = (v * 100).toFixed(1) + '%';
}

function getSettings() {
  const [w, h] = resolutionSel.value.split('x').map(n => parseInt(n, 10));
  const fps = parseInt(fpsSel.value, 10);
  const fontFamily = fontFamilyEl.value.trim() || 'Helvetica Neue, Arial, sans-serif';
  const fontSize = clamp(parseInt(fontSizeEl.value, 10) || 96, 12, 200);
  const enableFade = !!enableFadeEl.checked;
  const enableGrain = !!enableGrainEl.checked;
  return { w, h, fps, fontFamily, fontSize, enableFade, enableGrain };
}

function getDefaultTextStyle() {
  const fontFamily = fontFamilyEl.value.trim() || 'Helvetica Neue, Arial, sans-serif';
  const fontSize = clamp(parseInt(fontSizeEl.value, 10) || 96, 12, 200);
  return { fontFamily, fontSize };
}

function getCardTextStyle(card) {
  const defaults = getDefaultTextStyle();
  const family = (card?.fontFamily || '').trim();
  const size = Number(card?.fontSize);
  return {
    fontFamily: family || defaults.fontFamily,
    fontSize: Number.isFinite(size) && size > 0
      ? clamp(size, 12, 200)
      : defaults.fontSize,
  };
}

function cardUsesCustomTextStyle(card) {
  const family = (card?.fontFamily || '').trim();
  const size = Number(card?.fontSize);
  return !!family || (Number.isFinite(size) && size > 0);
}

function scaleFontSizeValue(size, oldH, newH) {
  if (!Number.isFinite(size) || size <= 0 || oldH <= 0 || newH === oldH) return size;
  return clamp(Math.round(size * (newH / oldH)), 12, 200);
}

function parseResolution(value) {
  const [w, h] = (value || resolutionSel?.value || '1920x1080').split('x').map(n => parseInt(n, 10));
  return { w, h };
}

let lastResolutionForFont = null;

function initFontResolutionTracking() {
  lastResolutionForFont = parseResolution(resolutionSel?.value);
}

function scaleFontSizeOnResolutionChange() {
  const newRes = parseResolution(resolutionSel?.value);
  if (!fontSizeEl) {
    lastResolutionForFont = newRes;
    return;
  }
  if (lastResolutionForFont) {
    const oldH = lastResolutionForFont.h;
    const newH = newRes.h;
    if (oldH > 0 && newH !== oldH) {
      const current = parseInt(fontSizeEl.value, 10) || 96;
      fontSizeEl.value = String(scaleFontSizeValue(current, oldH, newH));
      for (const card of cards) {
        const size = Number(card?.fontSize);
        if (Number.isFinite(size) && size > 0) {
          card.fontSize = scaleFontSizeValue(size, oldH, newH);
        }
      }
      renderCardsUI();
    }
  }
  lastResolutionForFont = newRes;
}

function totalDuration() {
  return cards.reduce((sum, c) => sum + (Number(c.duration) || 0), 0);
}

function updateMeta() {
  metaDuration.textContent = totalDuration().toFixed(2) + 's';
}

function escapeText(s) {
  return (s || '').replace(/[\u2028\u2029]/g, ' ');
}

function wrapText(ctx2, text, maxWidth) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const test = line + ' ' + words[i];
    if (ctx2.measureText(test).width <= maxWidth) line = test;
    else { lines.push(line); line = words[i]; }
  }
  lines.push(line);
  return lines;
}

function computeActiveCard(t) {
  let acc = 0;
  for (let i = 0; i < cards.length; i++) {
    const d = Number(cards[i].duration) || 0;
    if (t < acc + d) return { idx: i, localT: t - acc, start: acc, end: acc + d, dur: d, card: cards[i] };
    acc += d;
  }
  return null;
}

function isImageFile(file) {
  if (file.type?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || '');
}

function isVideoFile(file) {
  if (file.type?.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i.test(file.name || '');
}

function refreshCanvasFromSettings() {
  if (isPreviewing) {
    const t = clamp((performance.now() - previewStartMs) / 1000, 0, totalDuration());
    drawFrame(t);
  } else {
    redrawIdle();
  }
}

function drawGrain(w, h) {
  const count = Math.round((w * h) / 520);
  ctx.save();
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const lum = 125 + Math.floor(Math.random() * 95);
    const a = 0.11 + Math.random() * 0.24;
    const s = Math.random() * 2.6 + 0.8;
    ctx.fillStyle = `rgba(${lum},${lum},${lum},${a})`;
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}

function shouldBgVideoPlay() {
  return isPreviewing || isExporting;
}

function pauseBgVideoForIdle() {
  if (bg.type !== 'video' || !bg.el || shouldBgVideoPlay()) return;
  const vid = bg.el;
  try {
    if (!vid.paused) vid.pause();
    if (vid.currentTime !== 0) vid.currentTime = 0;
  } catch {}
}

function drawFrame(tSeconds) {
  const { w, h, enableFade, enableGrain } = getSettings();

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const fitMode = bgFitEl?.value || 'cover';

  if (bg.type === 'image' && bg.el) {
    const img = bg.el;
    const r = drawCoverOrContain(img.naturalWidth || w, img.naturalHeight || h, w, h, fitMode);
    ctx.drawImage(img, r.x, r.y, r.w, r.h);
  } else if (bg.type === 'video' && bg.el) {
    const vid = bg.el;
    if (shouldBgVideoPlay()) {
      if (vid.paused) { try { vid.play(); } catch {} }
    } else {
      pauseBgVideoForIdle();
    }
    const r = drawCoverOrContain(vid.videoWidth || w, vid.videoHeight || h, w, h, fitMode);
    try { ctx.drawImage(vid, r.x, r.y, r.w, r.h); } catch {}
  }

  if (bg.type !== 'none') {
    const dim = getBgOpacity01();
    if (dim > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${dim})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  const active = computeActiveCard(tSeconds);
  if (!active) return;

  const card = active.card;
  const contentAlpha = getCardContentAlpha(active, tSeconds, enableFade);

  if (card.image?.el) {
    drawCardImage(card, w, h, contentAlpha);
  }

  const text = escapeText(card.text || '').trim();
  if (!text) {
    drawEditChrome(card, w, h);
    if (enableGrain) drawGrain(w, h);
    return;
  }

  const textStyle = getCardTextStyle(card);
  drawCardText(card, w, h, contentAlpha, { ...textStyle, tSeconds, active });
  drawEditChrome(card, w, h);
  if (enableGrain) drawGrain(w, h);
}

function measureTextBlock(card, w, h, fontFamily, fontSize) {
  const text = escapeText(card.text || '').trim();
  if (!text) return null;

  const weight = 700;
  const lineHeight = 1.18;
  const maxWidth = w * 0.90;

  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  let lines = wrapText(ctx, text, maxWidth);
  let size = fontSize;

  for (let tries = 0; tries < 12; tries++) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    lines = wrapText(ctx, text, maxWidth);
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    if (widest <= maxWidth) break;
    size -= 6;
    if (size < 18) break;
  }

  ctx.font = `${weight} ${size}px ${fontFamily}`;
  const blockW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const blockH = lines.length * size * lineHeight;
  return { lines, size, lineHeight, blockW, blockH, weight };
}

function getTextRect(card, w, h, settings) {
  const block = measureTextBlock(card, w, h, settings.fontFamily, settings.fontSize);
  if (!block) return null;
  const pos = getCardPos(card);
  if (pos.dvd) return null;

  let left, top, anchorX;
  if (pos.preset === 'custom') {
    anchorX = pos.x * w;
    left = anchorX - block.blockW / 2;
    top = pos.y * h - block.blockH / 2;
  } else {
    const anchor = presetToAnchor(pos.preset);
    anchorX = anchor.ax * w;
    if (anchor.align === 'left') left = anchorX;
    else if (anchor.align === 'right') left = anchorX - block.blockW;
    else left = anchorX - block.blockW / 2;

    if (anchor.v === 'top') top = anchor.ay * h;
    else if (anchor.v === 'bottom') top = anchor.ay * h - block.blockH;
    else top = anchor.ay * h - block.blockH / 2;
  }

  return { left, top, w: block.blockW, h: block.blockH, block, anchorX };
}

function drawCardText(card, w, h, contentAlpha, settings) {
  const { fontFamily, fontSize, tSeconds = 0, active = null } = settings;
  const block = measureTextBlock(card, w, h, fontFamily, fontSize);
  if (!block) return;

  const pos = getCardPos(card);
  const dvdOn = !!pos.dvd;

  ctx.fillStyle = '#fff';
  ctx.font = `${block.weight} ${block.size}px ${fontFamily}`;

  if (dvdOn) {
    const margin = Math.max(12, Math.round(block.size * 0.25));
    const maxX = Math.max(1, w - block.blockW - margin * 2);
    const maxY = Math.max(1, h - block.blockH - margin * 2);

    if (!dvdState.init || !dvdState.lastWasDvd) {
      dvdState.init = true;
      dvdState.x = maxX * 0.5;
      dvdState.y = maxY * 0.5;
      dvdState.vx = 240;
      dvdState.vy = 185;
      dvdState.lastT = tSeconds;
    }

    let dt = tSeconds - dvdState.lastT;
    dt = clamp(dt, 0, 0.05);

    dvdState.x += dvdState.vx * dt;
    dvdState.y += dvdState.vy * dt;

    if (dvdState.x <= 0) { dvdState.x = 0; dvdState.vx = Math.abs(dvdState.vx); }
    else if (dvdState.x >= maxX) { dvdState.x = maxX; dvdState.vx = -Math.abs(dvdState.vx); }

    if (dvdState.y <= 0) { dvdState.y = 0; dvdState.vy = Math.abs(dvdState.vy); }
    else if (dvdState.y >= maxY) { dvdState.y = maxY; dvdState.vy = -Math.abs(dvdState.vy); }

    dvdState.lastT = tSeconds;
    dvdState.lastWasDvd = true;

    const xLeft = margin + dvdState.x;
    let y = margin + dvdState.y + (block.size * block.lineHeight / 2);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = contentAlpha;

    for (const line of block.lines) {
      ctx.fillText(line, xLeft, y);
      y += block.size * block.lineHeight;
    }
    ctx.globalAlpha = 1;
    return;
  }

  dvdState.lastWasDvd = false;

  const rect = getTextRect(card, w, h, settings);
  if (!rect) return;

  const pos2 = getCardPos(card);
  if (pos2.preset === 'custom') {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let y = rect.top + (block.size * block.lineHeight / 2);
    ctx.globalAlpha = contentAlpha;
    for (const line of block.lines) {
      ctx.fillText(line, rect.anchorX, y);
      y += block.size * block.lineHeight;
    }
  } else {
    const anchor = presetToAnchor(pos2.preset);
    ctx.textAlign = anchor.align;
    ctx.textBaseline = 'middle';
    let y = rect.top + (block.size * block.lineHeight / 2);
    const x = anchor.align === 'left' ? rect.left : anchor.align === 'right' ? rect.left + rect.w : rect.anchorX;
    ctx.globalAlpha = contentAlpha;
    for (const line of block.lines) {
      ctx.fillText(line, x, y);
      y += block.size * block.lineHeight;
    }
  }

  ctx.globalAlpha = 1;
}

function drawEditChrome(card, w, h) {
  if (isPreviewing || selectedCardIndex == null) return;
  const idx = cards.indexOf(card);
  if (idx !== selectedCardIndex) return;

  const settings = getCardTextStyle(card);
  const lineW = Math.max(2, w / 540);
  const handle = Math.max(12, w / 100);

  const ir = computeImageRect(card, w, h);
  if (ir) {
    ctx.save();
    ctx.strokeStyle = 'rgba(90,170,255,0.95)';
    ctx.lineWidth = lineW;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(ir.x, ir.y, ir.w, ir.h);
    ctx.fillStyle = 'rgba(90,170,255,0.95)';
    ctx.fillRect(ir.x + ir.w - handle, ir.y + ir.h - handle, handle, handle);
    ctx.restore();
  }

  const tr = getTextRect(card, w, h, settings);
  if (tr) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,210,80,0.95)';
    ctx.lineWidth = lineW;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(tr.left, tr.top, tr.w, tr.h);
    ctx.restore();
  }

  drawSnapGuides(w, h);
}

function drawSnapGuides(w, h) {
  if (snapGuides.vertical == null && snapGuides.horizontal == null) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(120,255,180,0.9)';
  ctx.lineWidth = Math.max(1.5, w / 720);
  ctx.setLineDash([8, 8]);
  if (snapGuides.vertical != null) {
    ctx.beginPath();
    ctx.moveTo(snapGuides.vertical, 0);
    ctx.lineTo(snapGuides.vertical, h);
    ctx.stroke();
  }
  if (snapGuides.horizontal != null) {
    ctx.beginPath();
    ctx.moveTo(0, snapGuides.horizontal);
    ctx.lineTo(w, snapGuides.horizontal);
    ctx.stroke();
  }
  ctx.restore();
}

function getAlignmentTargets(card, w, h, excludeKind) {
  const xs = [w * 0.5];
  const ys = [h * 0.5];

  if (excludeKind !== 'text') {
    const tr = getTextRect(card, w, h, getCardTextStyle(card));
    if (tr) {
      xs.push(tr.left + tr.w / 2);
      ys.push(tr.top + tr.h / 2);
    }
  }
  if (excludeKind !== 'image') {
    const ir = computeImageRect(card, w, h);
    if (ir) {
      xs.push(ir.cx);
      ys.push(ir.cy);
    }
  }

  return { xs, ys };
}

function snapAxis(value, targets, threshold) {
  let best = { value, snapped: false, dist: threshold + 1 };
  for (const t of targets) {
    const dist = Math.abs(value - t);
    if (dist <= threshold && dist < best.dist) {
      best = { value: t, snapped: true, dist };
    }
  }
  return best;
}

function applySnapToCenter(cx, cy, card, w, h, excludeKind) {
  const threshold = Math.max(10, w * SNAP_THRESHOLD_RATIO);
  const { xs, ys } = getAlignmentTargets(card, w, h, excludeKind);
  const sx = snapAxis(cx, xs, threshold);
  const sy = snapAxis(cy, ys, threshold);
  snapGuides = {
    vertical: sx.snapped ? sx.value : null,
    horizontal: sy.snapped ? sy.value : null,
  };
  return { cx: sx.value, cy: sy.value };
}

function computeImageRect(card, w, h) {
  const img = card?.image?.el;
  if (!img) return null;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;

  const scalePct = getImageScalePct(card) / 100;
  const maxW = w * 0.85;
  const maxH = h * 0.85;
  const base = Math.min(maxW / iw, maxH / ih, 1);
  const dw = iw * base * scalePct;
  const dh = ih * base * scalePct;

  const ip = getImagePos(card);
  const cx = ip.x * w;
  const cy = ip.y * h;
  return { x: cx - dw / 2, y: cy - dh / 2, w: dw, h: dh, cx, cy };
}

function drawCardImage(card, w, h, alpha) {
  const r = computeImageRect(card, w, h);
  if (!r) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(card.image.el, r.x, r.y, r.w, r.h);
  ctx.restore();
}

function hitTestEdit(px, py, card, w, h) {
  const settings = getCardTextStyle(card);
  const handle = Math.max(12, w / 100);
  const ir = computeImageRect(card, w, h);

  if (ir) {
    const hx = ir.x + ir.w - handle;
    const hy = ir.y + ir.h - handle;
    if (px >= hx && px <= hx + handle && py >= hy && py <= hy + handle) {
      return { kind: 'image', mode: 'scale' };
    }
    if (px >= ir.x && px <= ir.x + ir.w && py >= ir.y && py <= ir.y + ir.h) {
      return { kind: 'image', mode: 'move' };
    }
  }

  const tr = getTextRect(card, w, h, settings);
  if (tr && px >= tr.left && px <= tr.left + tr.w && py >= tr.top && py <= tr.top + tr.h) {
    return { kind: 'text', mode: 'move' };
  }

  return null;
}

function canvasPointFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}

function syncCardControlsFromData(idx) {
  const wrap = cardsEl.querySelector(`[data-card-index="${idx}"]`);
  if (!wrap) return;
  const card = cards[idx];
  ensureCardDefaults(card);

  const textPreset = wrap.querySelector('[data-field="text-preset"]');
  const imagePreset = wrap.querySelector('[data-field="image-preset"]');
  const imageScale = wrap.querySelector('[data-field="image-scale"]');
  const imageScaleVal = wrap.querySelector('[data-field="image-scale-val"]');

  if (textPreset) textPreset.value = card.pos.preset;
  if (imagePreset && card.image?.el) imagePreset.value = getImagePos(card).preset;
  if (imageScale && card.image?.el) {
    imageScale.value = String(getImageScalePct(card));
    if (imageScaleVal) imageScaleVal.textContent = `${getImageScalePct(card)}%`;
  }
}

function setupCanvasEditHandlers() {
  canvas.addEventListener('pointerdown', (e) => {
    if (isPreviewing) return;

    const { w, h } = getSettings();
    const p = canvasPointFromEvent(e);

    if (selectedCardIndex == null) return;
    const card = cards[selectedCardIndex];
    if (!card) return;

    const hit = hitTestEdit(p.x, p.y, card, w, h);
    if (!hit) {
      deselectCard();
      return;
    }

    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    if (hit.kind === 'image' && hit.mode === 'scale') {
      const ir = computeImageRect(card, w, h);
      editDrag = {
        kind: 'image',
        mode: 'scale',
        startX: p.x,
        startY: p.y,
        startScale: getImageScalePct(card),
        startDist: Math.max(40, Math.hypot(p.x - ir.cx, p.y - ir.cy)),
      };
    } else if (hit.kind === 'image') {
      const ip = getImagePos(card);
      editDrag = {
        kind: 'image',
        mode: 'move',
        startX: p.x,
        startY: p.y,
        origX: ip.x,
        origY: ip.y,
      };
    } else {
      const pos = getCardPos(card);
      const settings = getCardTextStyle(card);
      let origX = pos.x;
      let origY = pos.y;
      const tr = getTextRect(card, w, h, settings);
      if (tr && pos.preset !== 'custom') {
        origX = (tr.left + tr.w / 2) / w;
        origY = (tr.top + tr.h / 2) / h;
      }
      editDrag = {
        kind: 'text',
        mode: 'move',
        startX: p.x,
        startY: p.y,
        origX,
        origY,
      };
    }
    snapGuides = { vertical: null, horizontal: null };
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!editDrag || selectedCardIndex == null) return;
    const card = cards[selectedCardIndex];
    if (!card) return;

    const { w, h } = getSettings();
    const p = canvasPointFromEvent(e);

    if (editDrag.kind === 'image' && editDrag.mode === 'scale') {
      const ir = computeImageRect(card, w, h);
      const dist = Math.max(40, Math.hypot(p.x - ir.cx, p.y - ir.cy));
      const factor = dist / editDrag.startDist;
      card.image.scale = clamp(Math.round(editDrag.startScale * factor), 10, 100);
      syncCardControlsFromData(selectedCardIndex);
      snapGuides = { vertical: null, horizontal: null };
    } else if (editDrag.kind === 'image') {
      const dx = p.x - editDrag.startX;
      const dy = p.y - editDrag.startY;
      if (!card.image.pos) card.image.pos = { preset: 'center', x: 0.5, y: 0.5 };
      let cx = editDrag.origX * w + dx;
      let cy = editDrag.origY * h + dy;
      const snapped = applySnapToCenter(cx, cy, card, w, h, 'image');
      card.image.pos.preset = 'custom';
      card.image.pos.x = clamp(snapped.cx / w, 0.05, 0.95);
      card.image.pos.y = clamp(snapped.cy / h, 0.05, 0.95);
      syncCardControlsFromData(selectedCardIndex);
    } else {
      const dx = p.x - editDrag.startX;
      const dy = p.y - editDrag.startY;
      let cx = editDrag.origX * w + dx;
      let cy = editDrag.origY * h + dy;
      const snapped = applySnapToCenter(cx, cy, card, w, h, 'text');
      card.pos.preset = 'custom';
      card.pos.x = clamp(snapped.cx / w, 0.05, 0.95);
      card.pos.y = clamp(snapped.cy / h, 0.05, 0.95);
      syncCardControlsFromData(selectedCardIndex);
    }

    refreshEditView();
  });

  const endDrag = () => {
    editDrag = null;
    snapGuides = { vertical: null, horizontal: null };
    if (!isPreviewing) refreshEditView();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
}

function stopPreview() {
  if (!isPreviewing) return;
  isPreviewing = false;
  btnStop.disabled = true;
  updateActionButtons();

  if (!audioPlayer.paused) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
  }

  if (bg.type === 'video' && bg.el) {
    try { bg.el.pause(); } catch {}
    try { bg.el.currentTime = 0; } catch {}
  }

  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;

  setStatus('Stopped.');
}

function previewLoop() {
  if (!isPreviewing) return;
  const t = (performance.now() - previewStartMs) / 1000;
  drawFrame(t);
  if (t >= totalDuration()) { stopPreview(); return; }
  rafId = requestAnimationFrame(previewLoop);
}

btnPreview.addEventListener('click', () => {
  if (!isProjectValid()) return;

  canvas.style.display = 'block';
  resultVideo.style.display = 'none';

  isPreviewing = true;
  canvas.classList.remove('editMode');
  btnPreview.disabled = true;
  btnExport.disabled = true;
  btnStop.disabled = false;

  previewStartMs = performance.now();

  if (bg.type === 'video' && bg.el) {
    try { bg.el.currentTime = 0; } catch {}
    try { bg.el.play(); } catch {}
  }

  if (audioPlayer.src) {
    try { audioPlayer.currentTime = 0; audioPlayer.play(); } catch {}
  }

  setProgress(0);
  setStatus('Previewing...');
  rafId = requestAnimationFrame(previewLoop);
});

btnStop.addEventListener('click', stopPreview);

audioFile.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) { audioPlayer.removeAttribute('src'); audioPlayer.load(); return; }
  audioPlayer.src = URL.createObjectURL(file);
  audioPlayer.load();
});

// Background upload
function syncBgVideoControls() {
  const isVideo = bg.type === 'video' && bg.el;
  const opts = $('#bgVideoOptions');
  if (opts) opts.style.display = isVideo ? 'block' : 'none';
  if (!isVideo) return;

  const mute = !!bgMutePreviewEl?.checked;
  const loop = !!bgLoopEl?.checked;
  bg.el.loop = loop;
  bg.el.muted = mute;
  bg.el.volume = mute ? 0 : 1;
  pauseBgVideoForIdle();
}

function attachBackgroundVideo(vid, url) {
  let ready = false;
  const onReady = () => {
    if (ready) return;
    ready = true;
    bg = { type: 'video', url, el: vid };
    syncBgVideoControls();
    try { vid.currentTime = 0; } catch {}
    try { vid.pause(); } catch {}
    refreshCanvasFromSettings();
  };

  vid.addEventListener('loadedmetadata', onReady);
  vid.addEventListener('loadeddata', onReady);
  vid.addEventListener('error', () => {
    setStatus('Could not load background video.');
    bg = { type: 'none', url: null, el: null };
    syncBgVideoControls();
  });
  vid.load();
}

bgFile?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) {
    if (bg.url) URL.revokeObjectURL(bg.url);
    bg = { type: 'none', url: null, el: null };
    syncBgVideoControls();
    if (!isPreviewing) redrawIdle();
    return;
  }

  if (bg.url) URL.revokeObjectURL(bg.url);
  const url = URL.createObjectURL(file);

  if (isImageFile(file)) {
    const img = new Image();
    img.onload = () => {
      bg = { type: 'image', url, el: img };
      syncBgVideoControls();
      refreshCanvasFromSettings();
    };
    img.onerror = () => setStatus('Could not load background image.');
    img.src = url;
    return;
  }

  if (isVideoFile(file)) {
    const vid = document.createElement('video');
    vid.src = url;
    vid.playsInline = true;
    vid.preload = 'auto';
    attachBackgroundVideo(vid, url);
    return;
  }

  setStatus('Unsupported background file. Try MP4, WebM, MOV, PNG, or JPG.');

  bg = { type: 'none', url: null, el: null };
  syncBgVideoControls();
});

bgLoopEl?.addEventListener('change', () => {
  syncBgVideoControls();
  refreshCanvasFromSettings();
});
bgMutePreviewEl?.addEventListener('change', () => {
  syncBgVideoControls();
});

function ensureCardDefaults(card) {
  if (!card.pos) card.pos = { preset: 'center', x: 0.5, y: 0.5, dvd: false };
  if (!card.pos.preset) card.pos.preset = 'center';
  if (typeof card.pos.x !== 'number') card.pos.x = 0.5;
  if (typeof card.pos.y !== 'number') card.pos.y = 0.5;
  if (typeof card.pos.dvd !== 'boolean') card.pos.dvd = false;
  if (typeof card.duration !== 'number') card.duration = 2.0;
  if (typeof card.text !== 'string') card.text = '';
  if (card.image === undefined) card.image = null;
  if (card.image?.el) {
    if (!card.image.pos) card.image.pos = { preset: 'center', x: 0.5, y: 0.5 };
    if (typeof card.image.scale !== 'number') card.image.scale = 65;
  }
}

function cardHasContent(card) {
  const hasText = !!(card.text || '').trim();
  const hasImage = !!(card.image?.el);
  return hasText || hasImage;
}

function isProjectValid() {
  return cards.length > 0 && cards.every(cardHasContent);
}

function updateActionButtons() {
  const valid = isProjectValid();
  if (!isPreviewing) {
    btnPreview.disabled = !valid;
    btnExport.disabled = !valid;
  }
}

function revokeCardImage(card) {
  if (card?.image?.url) {
    try { URL.revokeObjectURL(card.image.url); } catch {}
  }
  card.image = null;
}

function cloneCard(card) {
  ensureCardDefaults(card);
  const copy = {
    text: card.text,
    duration: card.duration,
    pos: { ...card.pos },
    image: null,
  };
  const family = (card.fontFamily || '').trim();
  const size = Number(card.fontSize);
  if (family) copy.fontFamily = family;
  if (Number.isFinite(size) && size > 0) copy.fontSize = size;
  if (card.image?.url && card.image?.el) {
    copy.image = {
      url: card.image.url,
      el: card.image.el,
      name: card.image.name || 'image',
      scale: getImageScalePct(card),
      pos: { ...getImagePos(card) },
    };
  }
  return copy;
}

function setCardImage(card, file) {
  revokeCardImage(card);
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    card.image = {
      url,
      el: img,
      name: file.name,
      scale: 65,
      pos: { preset: 'center', x: 0.5, y: 0.5 },
    };
    renderCardsUI();
    if (!isPreviewing) redrawIdle();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    card.image = null;
    renderCardsUI();
  };
  img.src = url;
}

function setCardImageFromUrl(card, src, name, { scale = 58, pos = { preset: 'center', x: 0.5, y: 0.42 } } = {}) {
  revokeCardImage(card);
  const img = new Image();
  img.onload = () => {
    card.image = {
      url: src,
      el: img,
      name: name || 'image',
      scale,
      pos: { ...pos },
    };
    renderCardsUI();
    if (!isPreviewing) redrawIdle();
  };
  img.onerror = () => {
    card.image = null;
    renderCardsUI();
  };
  img.src = src;
}

function redrawIdle() {
  if (isPreviewing) return;
  drawFrame(getIdlePreviewTime());
}

function getCardContentAlpha(active, tSeconds, enableFade) {
  if (!enableFade) return 1;
  const fade = 0.18;
  const inA = Math.min(1, active.localT / fade);
  const outA = Math.min(1, (active.end - tSeconds) / fade);
  return clamp(Math.min(inA, outA), 0, 1);
}

/* Drag & drop reorder */
let dragFromIndex = null;

function onDragStart(idx, cardEl, e) {
  dragFromIndex = idx;
  cardEl.classList.add('dragging');
  try {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  } catch {}
}
function onDragEnd(el) {
  el.classList.remove('dragging');
  [...cardsEl.querySelectorAll('.cardItem')].forEach(x => x.classList.remove('dropTarget'));
  dragFromIndex = null;
}
function onDragOver(targetEl, e) {
  e.preventDefault();
  targetEl.classList.add('dropTarget');
}
function onDragLeave(targetEl) {
  targetEl.classList.remove('dropTarget');
}
function onDrop(toIdx, targetEl, e) {
  e.preventDefault();
  targetEl.classList.remove('dropTarget');

  const fromIdx = dragFromIndex ?? Number(e.dataTransfer?.getData('text/plain'));
  if (!Number.isFinite(fromIdx) || fromIdx === toIdx) return;

  const selectedBefore = selectedCardIndex;
  const lastBefore = lastSelectedCardIndex;
  const item = cards.splice(fromIdx, 1)[0];
  cards.splice(toIdx, 0, item);

  if (selectedBefore != null && Number.isFinite(selectedBefore)) {
    selectedCardIndex = adjustCardIndexAfterReorder(selectedBefore, fromIdx, toIdx);
  }
  if (lastBefore != null && Number.isFinite(lastBefore)) {
    lastSelectedCardIndex = adjustCardIndexAfterReorder(lastBefore, fromIdx, toIdx);
  }

  renderCardsUI();
  if (!isPreviewing) redrawIdle();
}

// Icons
const ICON_DUP = `
<svg viewBox="0 0 24 24" fill="none">
  <path d="M9 9h10v10H9V9Z" stroke="currentColor" stroke-width="2"/>
  <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="2"/>
</svg>`;
const ICON_DEL = `
<svg viewBox="0 0 24 24" fill="none">
  <path d="M6 7h12" stroke="currentColor" stroke-width="2"/>
  <path d="M10 11v7M14 11v7" stroke="currentColor" stroke-width="2"/>
  <path d="M9 7l1-2h4l1 2" stroke="currentColor" stroke-width="2"/>
  <path d="M7 7l1 14h8l1-14" stroke="currentColor" stroke-width="2"/>
</svg>`;
const ICON_GRIP = `
<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
  <circle cx="5.5" cy="4" r="1.25"/>
  <circle cx="10.5" cy="4" r="1.25"/>
  <circle cx="5.5" cy="8" r="1.25"/>
  <circle cx="10.5" cy="8" r="1.25"/>
  <circle cx="5.5" cy="12" r="1.25"/>
  <circle cx="10.5" cy="12" r="1.25"/>
</svg>`;

function renderCardsUI() {
  cardsEl.innerHTML = '';

  cards.forEach((c, idx) => {
    ensureCardDefaults(c);

    const wrap = document.createElement('div');
    wrap.className = 'cardItem';
    wrap.dataset.cardIndex = String(idx);
    if (idx === selectedCardIndex) wrap.classList.add('cardItem-selected');
    if (!cardHasContent(c)) wrap.classList.add('cardItem-invalid');

    const hasImage = !!c.image?.el;
    const imageControlsHidden = hasImage ? '' : 'style="display:none;"';

    wrap.innerHTML = `
      <div class="cardDragBar">
        <div class="cardDragHandle" draggable="true" title="Drag to reorder cards">${ICON_GRIP}</div>
        <div class="cardIdx">Card ${idx + 1}${idx === selectedCardIndex ? ' · editing' : ''}</div>
        <div class="iconRow">
          <button class="iconBtn" data-act="dup" title="Duplicate">${ICON_DUP}</button>
          <button class="iconBtn" data-act="del" title="Delete">${ICON_DEL}</button>
        </div>
      </div>

      <div class="split">
        <label>
          Text
          <textarea data-field="text" placeholder="Optional if image is set"></textarea>
        </label>
        <label class="durationField">
          Seconds
          <input data-field="duration" type="number" min="0.1" step="0.1" />
          <div class="durationSuggest" data-field="duration-suggest">
            <span class="durationSuggestVal" data-field="duration-suggest-val" role="button" tabindex="0" title="Click to apply suggested duration"></span>
          </div>
        </label>
      </div>

      <div class="posRow">
        <label>
          Text position
          <select data-field="text-preset">${PRESET_OPTIONS}</select>
        </label>
      </div>

      <div class="fontRow">
        <label>
          Font override
          <input data-field="font-family" type="text" placeholder="Default" />
        </label>
        <label>
          Size override
          <input data-field="font-size" type="number" min="12" max="200" placeholder="Default" />
        </label>
      </div>
      <div class="hint cardFontHint">Leave blank to use Text style defaults for this card.</div>

      <div class="cardError" data-field="error" style="display:none;">Cannot be empty — add text or an image.</div>

      <div class="cardImageRow">
        <label class="cardImageControls">
          <input data-field="image" type="file" accept="image/*" />
          <button type="button" class="btn small secondary" data-act="browse">Browse image</button>
          <button type="button" class="btn small secondary" data-act="clear-image" style="display:none;">Clear</button>
          <span class="cardImageName" data-field="image-name">No image</span>
        </label>
        <img class="cardImagePreview" data-field="image-preview" alt="" style="display:none;" />
      </div>

      <div class="cardImageControlsPanel" data-field="image-controls" ${imageControlsHidden}>
        <label>
          Image size
          <div class="sliderRow">
            <input data-field="image-scale" type="range" min="10" max="100" step="1" />
            <span data-field="image-scale-val">65%</span>
          </div>
        </label>
        <label>
          Image position
          <select data-field="image-preset">${PRESET_OPTIONS}</select>
        </label>
      </div>
    `;

    const ta = wrap.querySelector('textarea[data-field="text"]');
    const dur = wrap.querySelector('input[data-field="duration"]');
    const durationSuggestVal = wrap.querySelector('[data-field="duration-suggest-val"]');
    const textPresetSel = wrap.querySelector('select[data-field="text-preset"]');
    const fontFamilyInput = wrap.querySelector('input[data-field="font-family"]');
    const fontSizeInput = wrap.querySelector('input[data-field="font-size"]');
    const imagePresetSel = wrap.querySelector('select[data-field="image-preset"]');
    const imageScale = wrap.querySelector('input[data-field="image-scale"]');
    const imageScaleVal = wrap.querySelector('[data-field="image-scale-val"]');
    const imageControls = wrap.querySelector('[data-field="image-controls"]');
    const imageInput = wrap.querySelector('input[data-field="image"]');
    const imageName = wrap.querySelector('[data-field="image-name"]');
    const imagePreview = wrap.querySelector('[data-field="image-preview"]');
    const errorEl = wrap.querySelector('[data-field="error"]');
    const browseBtn = wrap.querySelector('button[data-act="browse"]');
    const clearImageBtn = wrap.querySelector('button[data-act="clear-image"]');
    const dragHandle = wrap.querySelector('.cardDragHandle');

    const stopCardSelect = (e) => e.stopPropagation();

    for (const el of wrap.querySelectorAll('input, textarea, select, button, .sliderRow, .cardImageControlsPanel, .durationSuggestVal')) {
      el.addEventListener('pointerdown', stopCardSelect);
      el.addEventListener('mousedown', stopCardSelect);
    }

    const syncCardValidationUi = () => {
      const valid = cardHasContent(cards[idx]);
      wrap.classList.toggle('cardItem-invalid', !valid);
      errorEl.style.display = valid ? 'none' : 'block';
      updateActionButtons();
    };

    const syncImageUi = () => {
      const img = cards[idx].image;
      if (img?.el) {
        imageName.textContent = img.name || 'Image';
        imagePreview.src = img.url;
        imagePreview.style.display = 'block';
        clearImageBtn.style.display = '';
        imageControls.style.display = '';
        imagePresetSel.value = getImagePos(cards[idx]).preset;
        imageScale.value = String(getImageScalePct(cards[idx]));
        imageScaleVal.textContent = `${getImageScalePct(cards[idx])}%`;
      } else {
        imageName.textContent = 'No image';
        imagePreview.removeAttribute('src');
        imagePreview.style.display = 'none';
        clearImageBtn.style.display = 'none';
        imageInput.value = '';
        imageControls.style.display = 'none';
      }
    };

    const syncDurationSuggest = () => {
      const suggested = suggestCardDuration(cards[idx]);
      const current = Number(cards[idx].duration || 0);
      const matches = Math.abs(current - suggested) < 0.05;
      durationSuggestVal.textContent = `Suggested: ${suggested.toFixed(1)}s`;
      durationSuggestVal.classList.toggle('durationSuggestVal-applied', matches);
      durationSuggestVal.setAttribute('aria-disabled', matches ? 'true' : 'false');
    };

    const applySuggestedDuration = () => {
      const suggested = suggestCardDuration(cards[idx]);
      const current = Number(cards[idx].duration || 0);
      if (Math.abs(current - suggested) < 0.05) return;
      cards[idx].duration = suggested;
      dur.value = suggested.toFixed(1);
      syncDurationSuggest();
      updateMeta();
    };

    ta.value = c.text ?? '';
    autosizeTA(ta);

    dur.value = Number(c.duration || 0).toString();
    textPresetSel.value = c.pos?.preset || 'center';
    fontFamilyInput.value = (c.fontFamily || '').trim();
    fontSizeInput.value = Number.isFinite(Number(c.fontSize)) && Number(c.fontSize) > 0
      ? String(c.fontSize)
      : '';
    if (c.image?.el) {
      imagePresetSel.value = getImagePos(c).preset;
      imageScale.value = String(getImageScalePct(c));
      imageScaleVal.textContent = `${getImageScalePct(c)}%`;
    }
    syncImageUi();
    syncCardValidationUi();
    syncDurationSuggest();

    ta.addEventListener('input', () => {
      cards[idx].text = ta.value;
      autosizeTA(ta);
      syncCardValidationUi();
      syncDurationSuggest();
      if (!isPreviewing) redrawIdle();
    });

    dur.addEventListener('input', () => {
      cards[idx].duration = Math.max(0.1, Number(dur.value || 0.1));
      syncDurationSuggest();
      updateMeta();
    });

    durationSuggestVal.addEventListener('click', (e) => {
      e.stopPropagation();
      applySuggestedDuration();
    });

    durationSuggestVal.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      applySuggestedDuration();
    });

    browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      imageInput.click();
    });

    imageInput.addEventListener('change', () => {
      const file = imageInput.files?.[0];
      if (!file) return;
      setCardImage(cards[idx], file);
      syncDurationSuggest();
    });

    clearImageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      revokeCardImage(cards[idx]);
      syncImageUi();
      syncCardValidationUi();
      syncDurationSuggest();
      if (!isPreviewing) redrawIdle();
    });

    imageScale.addEventListener('input', () => {
      if (!cards[idx].image?.el) return;
      cards[idx].image.scale = clamp(Number(imageScale.value) || 65, 10, 100);
      imageScaleVal.textContent = `${cards[idx].image.scale}%`;
      if (!isPreviewing) redrawIdle();
    });

    imagePresetSel.addEventListener('change', () => {
      if (!cards[idx].image?.el) return;
      if (!cards[idx].image.pos) cards[idx].image.pos = { preset: 'center', x: 0.5, y: 0.5 };
      applyPresetToPos(cards[idx].image.pos, imagePresetSel.value);
      if (!isPreviewing) redrawIdle();
    });

    textPresetSel.addEventListener('change', () => {
      applyPresetToPos(cards[idx].pos, textPresetSel.value);
      if (!isPreviewing) redrawIdle();
    });

    const syncCardFontFromInputs = () => {
      const family = fontFamilyInput.value.trim();
      const size = Number(fontSizeInput.value);
      cards[idx].fontFamily = family || undefined;
      if (Number.isFinite(size) && size > 0) cards[idx].fontSize = clamp(size, 12, 200);
      else delete cards[idx].fontSize;
      wrap.classList.toggle('cardItem-customFont', cardUsesCustomTextStyle(cards[idx]));
      if (!isPreviewing) redrawIdle();
    };

    fontFamilyInput.addEventListener('input', syncCardFontFromInputs);
    fontSizeInput.addEventListener('input', syncCardFontFromInputs);
    wrap.classList.toggle('cardItem-customFont', cardUsesCustomTextStyle(c));

    wrap.addEventListener('click', (e) => {
      if (e.target.closest('.cardDragHandle,button,input,textarea,select,label,.sliderRow,.durationSuggestVal')) return;
      setSelectedCard(idx);
    });

    dragHandle.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      onDragStart(idx, wrap, e);
    });
    dragHandle.addEventListener('dragend', () => onDragEnd(wrap));

    wrap.addEventListener('dragover', (e) => onDragOver(wrap, e));
    wrap.addEventListener('dragleave', () => onDragLeave(wrap));
    wrap.addEventListener('drop', (e) => onDrop(idx, wrap, e));

    wrap.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = btn.getAttribute('data-act');
        if (act === 'browse' || act === 'clear-image') return;
        if (act === 'del') {
          revokeCardImage(cards[idx]);
          cards.splice(idx, 1);
          if (!cards.length) {
            selectedCardIndex = null;
            lastSelectedCardIndex = null;
          } else {
            selectedCardIndex = adjustCardIndexAfterRemoval(selectedCardIndex, idx);
            lastSelectedCardIndex = adjustCardIndexAfterRemoval(lastSelectedCardIndex, idx);
          }
        } else if (act === 'dup') {
          cards.splice(idx + 1, 0, cloneCard(cards[idx]));
        }

        renderCardsUI();
        updateMeta();
        if (!isPreviewing) redrawIdle();
      });
    });

    cardsEl.appendChild(wrap);
  });

  updateMeta();
  updateActionButtons();
}

btnAdd.addEventListener('click', () => {
  cards.push({ text: 'New card', duration: 2.0, pos: { preset: 'center', x: 0.5, y: 0.5, dvd: false } });
  selectedCardIndex = cards.length - 1;
  renderCardsUI();
  if (!isPreviewing) redrawIdle();
});

function loadExampleCards() {
  cards.forEach(revokeCardImage);
  cards = [
    { text: 'Ahoy.', duration: 2.0, pos: { preset: 'center', x: 0.5, y: 0.5, dvd: false } },
    { text: 'Got something to tell you.', duration: 2.5, pos: { preset: 'center', x: 0.5, y: 0.5, dvd: false } },
    { text: 'Server maintenance. Sunday. 2-4am.', duration: 3.0, pos: { preset: 'center', x: 0.5, y: 0.48, dvd: false } },
    { text: 'Sorry for intruding on the free content I\'m providing.', duration: 3.0, pos: { preset: 'center', x: 0.5, y: 0.5, dvd: false } },
    {
      text: '[ahoy]',
      duration: 3.5,
      pos: { preset: 'custom', x: 0.5, y: 0.73, dvd: false },
      fontSize: 52,
    },
  ];
  selectedCardIndex = 0;
  lastSelectedCardIndex = 0;
  renderCardsUI();
  setCardImageFromUrl(cards[4], './assets/example-pirate-dog.png', 'example-pirate-dog.png', {
    scale: 48,
    pos: { preset: 'custom', x: 0.5, y: 0.5 },
  });
  if (!isPreviewing) redrawIdle();
}

btnLoadExample.addEventListener('click', () => {
  loadExampleCards();
});

btnClear.addEventListener('click', () => {
  cards.forEach(revokeCardImage);
  cards = [];
  selectedCardIndex = null;
  lastSelectedCardIndex = null;
  renderCardsUI();
  drawFrame(0);
});

/* ---- Progress bar fix ---- */
async function recordCanvasToBlob({ mimeType, includeAudio }) {
  const { fps } = getSettings();
  isExporting = true;
  try {
    drawFrame(0);

    const stream = canvas.captureStream(fps);

    let audioWasStarted = false;
    if (includeAudio && audioPlayer?.src && typeof audioPlayer.captureStream === 'function') {
      try {
        audioPlayer.currentTime = 0;
        await audioPlayer.play();
        audioWasStarted = true;

        const astream = audioPlayer.captureStream();
        for (const track of astream.getAudioTracks()) stream.addTrack(track);
      } catch {
        log('Audio captureStream failed, continuing without embedded audio...');
      }
    }

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    let resolveStop;
    const stopped = new Promise((res) => resolveStop = res);
    recorder.onstop = () => resolveStop();

    if (bg.type === 'video' && bg.el) {
      try { bg.el.currentTime = 0; } catch {}
      try { await bg.el.play(); } catch {}
    }

    recorder.start(200);

    const dur = totalDuration();
    const startMs = performance.now();

    setStatus('Recording...');
    while (true) {
      const t = (performance.now() - startMs) / 1000;
      drawFrame(t);

      const p = clamp(t / dur, 0, 1);
      setProgress(p * 0.9);
      setStatus(`Recording... ${t.toFixed(1)} / ${dur.toFixed(1)}s`);

      if (t >= dur) break;
      await new Promise(r => setTimeout(r, 0));
    }

    recorder.stop();
    await stopped;

    if (audioWasStarted) {
      try { audioPlayer.pause(); audioPlayer.currentTime = 0; } catch {}
    }

    return new Blob(chunks, { type: mimeType || 'video/webm' });
  } finally {
    isExporting = false;
    pauseBgVideoForIdle();
  }
}

/* ---- FFmpeg ---- */
async function fetchWithProgress(url, label, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    setStatus(label);
    const res = await fetch(url, { signal: ctrl.signal, cache: 'force-cache' });
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
    const buf = await res.arrayBuffer();
    return { buf, total: buf.byteLength };
  } finally { clearTimeout(t); }
}

async function toBlobURL(url, mimeType, label) {
  const { buf } = await fetchWithProgress(url, label || `Downloading ${url}`);
  const blob = new Blob([buf], { type: mimeType });
  return URL.createObjectURL(blob);
}

async function loadFFmpegModule() {
  try {
    const local = await import('./vendor/ffmpeg-esm/index.js');
    return local.FFmpeg;
  } catch {
    const cdn = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js');
    return cdn.FFmpeg;
  }
}

async function vendorFfmpegAvailable() {
  try {
    const res = await fetch('./vendor/ffmpeg-core.js', { method: 'HEAD', cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

function loadFfmpegWithTimeout(ffmpegInstance, config, timeoutMs = 120000) {
  return Promise.race([
    ffmpegInstance.load(config),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(
          `FFmpeg init timed out after ${timeoutMs / 1000}s. Keep this tab focused and try Chrome or Edge. Refresh the page and export again.`
        ));
      }, timeoutMs);
    }),
  ]);
}

async function loadFFmpegIfNeeded() {
  if (ffmpegLoaded) return;

  setProgress(0);
  if (logEl) logEl.textContent = '';
  setStatus('Loading ffmpeg-core (first time only)...');

  const FFmpeg = await loadFFmpegModule();
  ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => log(message));
  ffmpeg.on('progress', ({ progress }) => {
    if (typeof progress === 'number') setProgress(0.9 + progress * 0.1);
  });

  let loadConfig;
  if (await vendorFfmpegAvailable()) {
    loadConfig = {
      workerURL: './vendor/ffmpeg-esm/worker.js',
      classWorkerURL: './vendor/ffmpeg-esm/worker.js',
      coreURL: './vendor/ffmpeg-core.js',
      wasmURL: './vendor/ffmpeg-core.wasm',
    };
  } else {
    const coreBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
    const ffBase = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm';
    const workerURL = await toBlobURL(`${ffBase}/worker.js`, 'text/javascript', 'Downloading worker.js...');
    const coreURL = await toBlobURL(`${coreBase}/ffmpeg-core.js`, 'text/javascript', 'Downloading ffmpeg-core.js...');
    const wasmURL = await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, 'application/wasm', 'Downloading ffmpeg-core.wasm...');
    loadConfig = { workerURL, classWorkerURL: workerURL, coreURL, wasmURL };
  }

  setStatus('Initializing ffmpeg (compiling wasm)...');
  log(`crossOriginIsolated=${crossOriginIsolated}`);
  await loadFfmpegWithTimeout(ffmpeg, loadConfig);

  ffmpegLoaded = true;
  setProgress(0);
  setStatus('ffmpeg loaded.');
}

function pickMp4Mime() {
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4'
  ];
  for (const c of candidates) { try { if (MediaRecorder.isTypeSupported(c)) return c; } catch {} }
  return '';
}

function pickWebmMime() {
  const candidates = ['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  for (const c of candidates) { if (MediaRecorder.isTypeSupported(c)) return c; }
  return '';
}

function fileExt(name) {
  const m = (name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : 'bin';
}

async function muxToMp4(webmBlob, audioFileObjOrNull) {
  await loadFFmpegIfNeeded();
  setStatus('Converting to MP4...');

  const webmData = new Uint8Array(await webmBlob.arrayBuffer());
  await ffmpeg.writeFile('input.webm', webmData);

  if (audioFileObjOrNull) {
    const ext = fileExt(audioFileObjOrNull.name);
    const audioName = `music.${ext}`;
    const audioData = new Uint8Array(await audioFileObjOrNull.arrayBuffer());
    await ffmpeg.writeFile(audioName, audioData);

    await ffmpeg.exec([
      '-i', 'input.webm',
      '-i', audioName,
      '-c:v', 'mpeg4',
      '-q:v', '2',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      'output.mp4',
    ]);
  } else {
    await ffmpeg.exec([
      '-i', 'input.webm',
      '-c:v', 'mpeg4',
      '-q:v', '2',
      '-pix_fmt', 'yuv420p',
      'output.mp4',
    ]);
  }

  const out = await ffmpeg.readFile('output.mp4');
  return new Blob([out.buffer], { type: 'video/mp4' });
}

btnExport.addEventListener('click', async () => {
  if (!isProjectValid()) return;

  stopPreview();
  deselectCard();

  canvas.style.display = 'block';
  resultVideo.style.display = 'none';

  if (logEl) logEl.textContent = '';
  setProgress(0);
  setStatus('Starting export...');

  btnPreview.disabled = true;
  btnExport.disabled = true;
  btnStop.disabled = true;

  try {
    const audio = audioFile.files?.[0] || null;

    const mp4Mime = pickMp4Mime();
    const canEmbedAudio = !!(audio && typeof audioPlayer.captureStream === 'function');
    let mp4;

    if (mp4Mime) {
      const mp4Direct = await recordCanvasToBlob({ mimeType: mp4Mime, includeAudio: canEmbedAudio });
      if (canEmbedAudio) mp4 = mp4Direct;
      else {
        if (audio) {
          const webmForMux = await recordCanvasToBlob({ mimeType: pickWebmMime(), includeAudio: false });
          mp4 = await muxToMp4(webmForMux, audio);
        } else mp4 = mp4Direct;
      }
    } else {
      const webm = await recordCanvasToBlob({ mimeType: pickWebmMime(), includeAudio: false });
      mp4 = await muxToMp4(webm, audio);
    }

    const url = URL.createObjectURL(mp4);

    canvas.style.display = 'none';
    resultVideo.src = url;
    resultVideo.style.display = 'block';

    downloadLink.href = url;
    downloadLink.download = `bump-${new Date().toISOString().replace(/[:.]/g,'-')}.mp4`;
    downloadLink.click();

    setProgress(1);
    setStatus('Done. Download started.');
  } catch (err) {
    console.error(err);
    const msg = String(err?.message || err);
    setStatus(msg.includes('timed out') ? msg : 'Export failed. Try Chrome or Edge if Firefox hangs on export.');
    log(msg);
    setProgress(0);
  } finally {
    updateActionButtons();
  }
});

for (const el of [
  fpsSel, fontFamilyEl, fontSizeEl, enableFadeEl, enableGrainEl,
  bgFitEl, bgDimEl, bgMutePreviewEl, bgLoopEl
]) {
  if (!el) continue;
  el.addEventListener('change', () => { updateMeta(); refreshCanvasFromSettings(); });
  el.addEventListener('input',  () => { updateMeta(); refreshCanvasFromSettings(); });
}

resolutionSel?.addEventListener('change', () => {
  scaleFontSizeOnResolutionChange();
  updateMeta();
  refreshCanvasFromSettings();
});

function setupDeselectHandlers() {
  document.addEventListener('click', (e) => {
    if (selectedCardIndex == null) return;
    if (e.target.closest('.cardItem')) return;
    if (e.target.closest('button, a')) return;
    if (e.target.closest('#canvas, .canvasWrapTop, #resultVideo')) return;
    deselectCard();
  });
}

setupCanvasEditHandlers();
setupDeselectHandlers();

loadExampleCards();
initFontResolutionTracking();
syncBgVideoControls();
updateMeta();
updateActionButtons();
setStatus('Select a card, then drag text (gold) or image (blue) in the preview.');