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
const btnClearAll = $('#btnClearAll');
const btnAdd = $('#btnAdd');
const btnLoadExample = $('#btnLoadExample');
const btnClear = $('#btnClear');
const btnTemplates = $('#btnTemplates');
const templatesPanel = $('#templatesPanel');

const templateSelect = $('#templateSelect');
const btnLoadTemplate = $('#btnLoadTemplate');
const btnSaveTemplate = $('#btnSaveTemplate');
const btnDeleteTemplate = $('#btnDeleteTemplate');
const btnExportTemplate = $('#btnExportTemplate');
const btnImportTemplate = $('#btnImportTemplate');
const templateImportFile = $('#templateImportFile');

const promptDialog = $('#promptDialog');
const promptDialogTitle = $('#promptDialogTitle');
const promptDialogMessage = $('#promptDialogMessage');
const promptDialogLabel = $('#promptDialogLabel');
const promptDialogInput = $('#promptDialogInput');
const promptDialogOk = $('#promptDialogOk');
const promptDialogCancel = $('#promptDialogCancel');

const audioFile = $('#audioFile');
const btnBrowseAudio = $('#btnBrowseAudio');
const btnClearAudio = $('#btnClearAudio');
const audioFileName = $('#audioFileName');
const audioLoadedBlock = $('#audioLoadedBlock');
const audioPlayer = $('#audioPlayer');
const downloadLink = $('#downloadLink');
const resultVideo = $('#resultVideo');

const bgFile = $('#bgFile');
const btnBrowseBg = $('#btnBrowseBg');
const btnClearBg = $('#btnClearBg');
const bgFileName = $('#bgFileName');
const bgPreviewWrap = $('#bgPreviewWrap');
const bgImagePreview = $('#bgImagePreview');
const bgFitEl = $('#bgFit');
const bgDimEl = $('#bgDim'); // Opacity
const bgMutePreviewEl = $('#bgMutePreview');
const bgLoopEl = $('#bgLoop');

const confirmDialog = $('#confirmDialog');
const confirmDialogTitle = $('#confirmDialogTitle');
const confirmDialogMessage = $('#confirmDialogMessage');
const confirmDialogOk = $('#confirmDialogOk');
const confirmDialogCancel = $('#confirmDialogCancel');

const resolutionSel = $('#resolution');
const fpsSel = $('#fps');
const fontFamilyEl = $('#fontFamily');
const fontSizeEl = $('#fontSize');
const enableFadeEl = $('#enableFade');
const enableGrainEl = $('#enableGrain');
const previewFrame = $('#previewFrame');

const STORAGE_KEY = 'ahoy-draft-v1';
const DRAFT_DB_NAME = 'ahoy-draft-db';
const DRAFT_STORE = 'draft';
const TEMPLATE_STORE = 'templates';
const TEMPLATE_KIND = 'ahoy-template';
const TEMPLATE_VERSION = 1;
const TEMPLATES_PANEL_KEY = 'ahoy-templates-panel-open';
const DB_VERSION = 2;
const MAX_CARD_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const MAX_BG_BYTES = 32 * 1024 * 1024;
let saveProjectTimer = null;
let audioObjectUrl = null;
let canvasTextEditEl = null;
let canvasTextEditCardIdx = null;
let isRestoringProject = false;

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
function syncAudioUi(name, { restored = false } = {}) {
  const has = !!getAudioPersistSrc();
  if (audioFileName) {
    if (has) {
      const label = name || 'Audio loaded';
      audioFileName.textContent = restored ? `${label} (restored)` : label;
    } else {
      audioFileName.textContent = 'No audio';
    }
  }
  if (btnBrowseAudio) {
    btnBrowseAudio.textContent = has ? 'Replace audio' : 'Choose audio';
  }
  if (btnClearAudio) btnClearAudio.hidden = !has;
  if (audioLoadedBlock) audioLoadedBlock.hidden = !has;
}

function frameLuminance(canvas) {
  const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 16) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    count++;
  }
  return count ? sum / count : 0;
}

function captureVideoFrame(videoEl) {
  return new Promise((resolve) => {
    const src = videoEl.currentSrc || videoEl.src;
    if (!src) { resolve(null); return; }

    const thumb = document.createElement('video');
    thumb.muted = true;
    thumb.playsInline = true;
    thumb.preload = 'auto';

    const seekRatios = [0.5, 0.35, 0.65, 0.2, 0.8];
    let ratioIdx = 0;
    let bestDataUrl = null;
    let bestLuma = 0;

    const cleanup = () => {
      thumb.removeEventListener('seeked', onSeeked);
      thumb.removeAttribute('src');
      try { thumb.load(); } catch {}
      thumb.remove();
    };

    const finish = (dataUrl) => {
      cleanup();
      resolve(dataUrl || bestDataUrl);
    };

    const tryNextSeek = () => {
      const duration = thumb.duration;
      if (!Number.isFinite(duration) || duration <= 0 || ratioIdx >= seekRatios.length) {
        finish(bestDataUrl);
        return;
      }
      const ratio = seekRatios[ratioIdx++];
      const t = Math.min(Math.max(0, duration - 0.04), Math.max(0, duration * ratio));
      try { thumb.currentTime = t; }
      catch { finish(bestDataUrl); }
    };

    const onSeeked = () => {
      try {
        const w = thumb.videoWidth;
        const h = thumb.videoHeight;
        if (!w || !h) { tryNextSeek(); return; }

        const maxH = 72;
        const scale = Math.min(1, maxH / h);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        canvas.getContext('2d').drawImage(thumb, 0, 0, canvas.width, canvas.height);

        const luma = frameLuminance(canvas);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        if (luma > bestLuma) {
          bestLuma = luma;
          bestDataUrl = dataUrl;
        }
        // Bright enough — stop early (skip mostly-black frames)
        if (luma >= 18) {
          finish(dataUrl);
          return;
        }
        tryNextSeek();
      } catch {
        tryNextSeek();
      }
    };

    thumb.addEventListener('error', () => finish(null), { once: true });
    thumb.addEventListener('seeked', onSeeked);
    thumb.addEventListener('loadedmetadata', () => tryNextSeek(), { once: true });

    thumb.src = src;
    thumb.load();
  });
}

function syncBgPreview() {
  if (!bgPreviewWrap || !bgImagePreview) return;

  if (bg.type === 'image' && bg.el) {
    bgImagePreview.src = bg.url || bg.el.src;
    bgImagePreview.alt = bgFileName?.textContent || 'Background image';
    bgPreviewWrap.hidden = false;
    return;
  }

  if (bg.type === 'video' && bg.el) {
    bgPreviewWrap.hidden = false;
    bgImagePreview.alt = bgFileName?.textContent || 'Background video';
    captureVideoFrame(bg.el).then((poster) => {
      if (bg.type !== 'video' || !bg.el) return;
      if (poster) bgImagePreview.src = poster;
      else bgPreviewWrap.hidden = true;
    });
    return;
  }

  bgPreviewWrap.hidden = true;
  bgImagePreview.removeAttribute('src');
  bgImagePreview.alt = '';
}

function syncBgUi(name, { restored = false } = {}) {
  if (!bgFileName) return;
  if (bg.type === 'image' || bg.type === 'video') {
    const label = name || (bg.type === 'video' ? 'Video background' : 'Image background');
    bgFileName.textContent = restored ? `${label} (restored)` : label;
  } else {
    bgFileName.textContent = 'No background';
  }
  if (btnBrowseBg) {
    btnBrowseBg.textContent = bg.type !== 'none' ? 'Replace file' : 'Choose file';
  }
  if (btnClearBg) btnClearBg.hidden = bg.type === 'none';
  syncBgPreview();
}

function getAudioPersistSrc() {
  const src = audioPlayer?.getAttribute('src')?.trim() || '';
  if (!src || src === window.location.href) return '';
  return src;
}

function projectHasContent() {
  return cards.length > 0 || !!getAudioPersistSrc() || bg.type !== 'none';
}

let confirmResolve = null;

function showConfirm(message, { title = 'Are you sure?', confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    if (!confirmDialog) {
      resolve(window.confirm(message));
      return;
    }
    if (confirmResolve) confirmResolve(false);

    confirmResolve = resolve;
    confirmDialogTitle.textContent = title;
    confirmDialogMessage.textContent = message;
    confirmDialogOk.textContent = confirmLabel;
    confirmDialogCancel.textContent = cancelLabel;
    confirmDialog.hidden = false;

    const finish = (result) => {
      confirmDialog.hidden = true;
      document.removeEventListener('keydown', onKeydown);
      confirmDialogOk.onclick = null;
      confirmDialogCancel.onclick = null;
      const backdrop = confirmDialog.querySelector('[data-confirm-cancel]');
      if (backdrop) backdrop.onclick = null;
      const r = confirmResolve;
      confirmResolve = null;
      r?.(result);
    };

    const onKeydown = (e) => {
      if (confirmDialog.hidden) return;
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    };

    confirmDialogOk.onclick = () => finish(true);
    confirmDialogCancel.onclick = () => finish(false);
    const backdrop = confirmDialog.querySelector('[data-confirm-cancel]');
    if (backdrop) backdrop.onclick = () => finish(false);
    document.addEventListener('keydown', onKeydown);
    confirmDialogOk.focus();
  });
}

let promptResolve = null;

function showPrompt(message, {
  title = 'Save',
  label = 'Name',
  defaultValue = '',
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
} = {}) {
  return new Promise((resolve) => {
    if (!promptDialog || !promptDialogInput) {
      const v = window.prompt(message, defaultValue);
      resolve(v == null ? null : String(v).trim());
      return;
    }
    if (promptResolve) promptResolve(null);

    promptResolve = resolve;
    promptDialogTitle.textContent = title;
    promptDialogMessage.textContent = message;
    if (promptDialogLabel) promptDialogLabel.textContent = label;
    promptDialogInput.value = defaultValue;
    promptDialogOk.textContent = confirmLabel;
    promptDialogCancel.textContent = cancelLabel;
    promptDialog.hidden = false;

    const finish = (result) => {
      promptDialog.hidden = true;
      document.removeEventListener('keydown', onKeydown);
      promptDialogOk.onclick = null;
      promptDialogCancel.onclick = null;
      const backdrop = promptDialog.querySelector('[data-prompt-cancel]');
      if (backdrop) backdrop.onclick = null;
      const r = promptResolve;
      promptResolve = null;
      r?.(result);
    };

    const onKeydown = (e) => {
      if (promptDialog.hidden) return;
      if (e.key === 'Escape') finish(null);
      if (e.key === 'Enter') finish(promptDialogInput.value.trim() || null);
    };

    promptDialogOk.onclick = () => finish(promptDialogInput.value.trim() || null);
    promptDialogCancel.onclick = () => finish(null);
    const backdrop = promptDialog.querySelector('[data-prompt-cancel]');
    if (backdrop) backdrop.onclick = () => finish(null);
    document.addEventListener('keydown', onKeydown);
    promptDialogInput.focus();
    promptDialogInput.select();
  });
}

function openDraftDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DRAFT_DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE);
      }
      if (!db.objectStoreNames.contains(TEMPLATE_STORE)) {
        db.createObjectStore(TEMPLATE_STORE);
      }
    };
  });
}

async function idbSetDraft(value) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readwrite');
    tx.objectStore(DRAFT_STORE).put(value, STORAGE_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetDraft() {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readonly');
    const req = tx.objectStore(DRAFT_STORE).get(STORAGE_KEY);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

async function idbRemoveDraft() {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DRAFT_STORE, 'readwrite');
    tx.objectStore(DRAFT_STORE).delete(STORAGE_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbListTemplateNames() {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, 'readonly');
    const req = tx.objectStore(TEMPLATE_STORE).getAll();
    req.onsuccess = () => {
      db.close();
      const items = (req.result || [])
        .filter((t) => t?.name && t?.cards?.length)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbGetTemplate(name) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, 'readonly');
    const req = tx.objectStore(TEMPLATE_STORE).get(name);
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

async function idbSetTemplate(name, value) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, 'readwrite');
    tx.objectStore(TEMPLATE_STORE).put(value, name);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDeleteTemplate(name) {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEMPLATE_STORE, 'readwrite');
    tx.objectStore(TEMPLATE_STORE).delete(name);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}

function normalizeTemplateName(name) {
  return String(name || '').trim().slice(0, 60);
}

function slugifyTemplateName(name) {
  return normalizeTemplateName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'template';
}

function isValidTemplateData(data) {
  return data?.kind === TEMPLATE_KIND
    && data?.version === TEMPLATE_VERSION
    && Array.isArray(data.cards)
    && data.cards.length > 0
    && typeof data.name === 'string'
    && data.name.trim();
}

function describeTemplateLoad(data) {
  const parts = ['cards and text style'];
  if (data.audio?.dataUrl) parts.push('audio');
  if (data.background?.dataUrl) parts.push('background');
  const kept = [];
  if (!data.audio?.dataUrl) kept.push('audio');
  if (!data.background?.dataUrl) kept.push('background');
  let msg = `Load template "${data.name}"?\n\nThis will replace ${parts.join(', ')}.`;
  if (kept.length) msg += `\n\nYour current ${kept.join(' and ')} will stay.`;
  return msg;
}

function clearAudio({ skipSave = false } = {}) {
  if (audioObjectUrl) {
    try { URL.revokeObjectURL(audioObjectUrl); } catch {}
    audioObjectUrl = null;
  }
  audioFile.value = '';
  try { audioPlayer.pause(); } catch {}
  audioPlayer.removeAttribute('src');
  audioPlayer.src = '';
  try { audioPlayer.load(); } catch {}
  syncAudioUi();
  if (!skipSave) scheduleSaveProject(true);
}

function clearBackground({ skipSave = false } = {}) {
  if (bg.url && !bg.url.startsWith('data:')) {
    try { URL.revokeObjectURL(bg.url); } catch {}
  }
  bg = { type: 'none', url: null, el: null };
  if (bgFile) bgFile.value = '';
  syncBgVideoControls();
  syncBgUi();
  if (!isPreviewing) redrawIdle();
  if (!skipSave) scheduleSaveProject(true);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function urlToDataUrl(url, maxBytes) {
  const res = await fetch(url);
  const blob = await res.blob();
  if (blob.size > maxBytes) return { dataUrl: null, tooLarge: true, size: blob.size };
  return { dataUrl: await blobToDataUrl(blob), tooLarge: false, size: blob.size };
}

function getSettingsForStorage() {
  return {
    resolution: resolutionSel?.value,
    fps: fpsSel?.value,
    fontFamily: fontFamilyEl?.value,
    fontSize: fontSizeEl?.value,
    enableFade: !!enableFadeEl?.checked,
    enableGrain: !!enableGrainEl?.checked,
    bgFit: bgFitEl?.value,
    bgDim: bgDimEl?.value,
    bgMute: !!bgMutePreviewEl?.checked,
    bgLoop: !!bgLoopEl?.checked,
  };
}

function applyTextSettingsFromStorage(s) {
  if (!s) return;
  if (fontFamilyEl && s.fontFamily != null) fontFamilyEl.value = s.fontFamily;
  if (fontSizeEl && s.fontSize != null) fontSizeEl.value = s.fontSize;
  if (enableFadeEl) enableFadeEl.checked = !!s.enableFade;
  if (enableGrainEl) enableGrainEl.checked = !!s.enableGrain;
}

function applyBgSettingsFromStorage(s) {
  if (!s) return;
  if (bgFitEl && s.bgFit) bgFitEl.value = s.bgFit;
  if (bgDimEl && s.bgDim != null) bgDimEl.value = s.bgDim;
  if (bgMutePreviewEl) bgMutePreviewEl.checked = s.bgMute !== false;
  if (bgLoopEl) bgLoopEl.checked = s.bgLoop !== false;
}

function applyOutputSettingsFromStorage(s) {
  if (!s) return;
  if (resolutionSel && s.resolution) resolutionSel.value = s.resolution;
  if (fpsSel && s.fps) fpsSel.value = s.fps;
}

function applySettingsFromStorage(s) {
  applyTextSettingsFromStorage(s);
  applyBgSettingsFromStorage(s);
  applyOutputSettingsFromStorage(s);
  initFontResolutionTracking();
  syncBgVideoControls();
}

async function serializeProject() {
  const serializedCards = [];
  for (const card of cards) {
    ensureCardDefaults(card);
    const entry = {
      text: card.text || '',
      duration: card.duration,
      pos: { ...card.pos },
      fontFamily: card.fontFamily,
      fontSize: card.fontSize,
    };
    if (card.image?.el && card.image?.url) {
      try {
        const { dataUrl } = await urlToDataUrl(card.image.url, MAX_CARD_IMAGE_BYTES);
        if (dataUrl) {
          entry.image = {
            name: card.image.name || 'image',
            scale: getImageScalePct(card),
            pos: { ...getImagePos(card) },
            dataUrl,
          };
        }
      } catch {}
    }
    serializedCards.push(entry);
  }

  let audio = null;
  let draftWarnings = [];
  const audioSrc = getAudioPersistSrc();
  if (audioSrc) {
    try {
      if (audioSrc.startsWith('data:')) {
        audio = { name: audioFileName?.textContent?.replace(/ \(restored\)$/, '') || 'audio', dataUrl: audioSrc };
      } else {
        const { dataUrl, tooLarge } = await urlToDataUrl(audioSrc, MAX_AUDIO_BYTES);
        if (dataUrl) {
          audio = { name: audioFileName?.textContent?.replace(/ \(restored\)$/, '') || 'audio', dataUrl };
        } else if (tooLarge) {
          draftWarnings.push('Audio is too large to save in draft (max 32 MB).');
        }
      }
    } catch {}
  }

  let background = null;
  if (bg.type !== 'none' && bg.url) {
    try {
      const { dataUrl, tooLarge } = await urlToDataUrl(bg.url, MAX_BG_BYTES);
      if (dataUrl) {
        background = {
          type: bg.type,
          name: bgFileName?.textContent?.replace(/ \(restored\)$/, '') || 'background',
          dataUrl,
        };
      } else if (tooLarge) {
        draftWarnings.push('Background is too large to save in draft (max 32 MB).');
      }
    } catch {}
  }

  if (draftWarnings.length) {
    setStatus(draftWarnings[0]);
  }

  return {
    version: 1,
    cards: serializedCards,
    settings: getSettingsForStorage(),
    selectedCardIndex,
    lastSelectedCardIndex,
    audio,
    background,
  };
}

async function saveProjectToStorage() {
  if (isRestoringProject || !cards.length) return;
  try {
    const data = await serializeProject();
    await idbSetDraft(data);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  } catch (err) {
    console.warn('Could not save draft', err);
    try {
      const data = await serializeProject();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }
}

function scheduleSaveProject(immediate = false) {
  if (isRestoringProject) return;
  clearTimeout(saveProjectTimer);
  if (immediate) {
    saveProjectToStorage();
    return;
  }
  saveProjectTimer = setTimeout(() => { saveProjectToStorage(); }, 600);
}

async function clearProjectStorage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
  try { await idbRemoveDraft(); } catch {}
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function attachCardImageFromSaved(card, saved) {
  if (!saved?.dataUrl) return;
  loadImageFromDataUrl(saved.dataUrl).then((img) => {
    card.image = {
      url: saved.dataUrl,
      el: img,
      name: saved.name || 'image',
      scale: saved.scale ?? 65,
      pos: { ...(saved.pos || { preset: 'center', x: 0.5, y: 0.5 }) },
    };
    renderCardsUI();
    scheduleSaveProject();
    if (!isPreviewing) redrawIdle();
  }).catch(() => {});
}

function attachBackgroundFromSaved(saved) {
  if (!saved?.dataUrl) return;
  if (saved.type === 'image') {
    loadImageFromDataUrl(saved.dataUrl).then((img) => {
      bg = { type: 'image', url: saved.dataUrl, el: img };
      syncBgVideoControls();
      syncBgUi(saved.name, { restored: true });
      refreshCanvasFromSettings();
    }).catch(() => {});
    return;
  }
  if (saved.type === 'video') {
    const vid = document.createElement('video');
    vid.src = saved.dataUrl;
    vid.playsInline = true;
    vid.preload = 'auto';
    attachBackgroundVideo(vid, saved.dataUrl, saved.name, { restored: true });
  }
}

async function applyProjectData(data, { mode = 'draft' } = {}) {
  if (!data?.cards?.length) return false;

  const isTemplate = mode === 'template';
  const hasAudio = !!data.audio?.dataUrl;
  const hasBackground = !!data.background?.dataUrl;
  const applyAudio = isTemplate ? hasAudio : true;
  const applyBackground = isTemplate ? hasBackground : true;
  const applyBgSettings = isTemplate ? hasBackground : true;
  const applyOutput = !isTemplate;

  isRestoringProject = true;
  try {
    cards.forEach(revokeCardImage);
    cards = data.cards.map((c) => ({
      text: c.text || '',
      duration: Number(c.duration) || 2,
      pos: { ...(c.pos || { preset: 'center', x: 0.5, y: 0.5, dvd: false }) },
      fontFamily: c.fontFamily,
      fontSize: c.fontSize,
      image: null,
    }));

    applyTextSettingsFromStorage(data.settings);
    if (applyBgSettings) applyBgSettingsFromStorage(data.settings);
    if (applyOutput) applyOutputSettingsFromStorage(data.settings);
    initFontResolutionTracking();
    syncBgVideoControls();

    const sel = Number.isFinite(data.selectedCardIndex) ? data.selectedCardIndex : 0;
    const last = Number.isFinite(data.lastSelectedCardIndex) ? data.lastSelectedCardIndex : sel;
    selectedCardIndex = sel >= 0 && sel < cards.length ? sel : (cards.length ? 0 : null);
    lastSelectedCardIndex = last >= 0 && last < cards.length ? last : (selectedCardIndex ?? 0);

    data.cards.forEach((c, i) => {
      if (c.image) attachCardImageFromSaved(cards[i], c.image);
    });

    if (applyBackground) {
      if (data.background) {
        if (bg.type !== 'none') clearBackground({ skipSave: true });
        attachBackgroundFromSaved(data.background);
      } else if (!isTemplate) {
        clearBackground({ skipSave: true });
      }
    } else {
      syncBgUi();
    }

    if (applyAudio) {
      if (data.audio?.dataUrl) {
        clearAudio({ skipSave: true });
        audioPlayer.src = data.audio.dataUrl;
        audioPlayer.load();
        syncAudioUi(data.audio.name, { restored: true });
      } else if (!isTemplate) {
        clearAudio({ skipSave: true });
      }
    }

    renderCardsUI();
    updateMeta();
    updateActionButtons();
    if (!isPreviewing) refreshEditView();
    return true;
  } catch (err) {
    console.warn('Could not apply project', err);
    return false;
  } finally {
    isRestoringProject = false;
  }
}

async function loadProjectFromStorage() {
  let data = null;
  try { data = await idbGetDraft(); } catch {}
  if (!data) {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        data = JSON.parse(raw);
        if (data?.cards?.length) {
          await idbSetDraft(data);
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {}
    }
  }
  if (!data?.cards?.length) return false;
  return applyProjectData(data, { mode: 'draft' });
}

function closeCanvasTextEdit(commit = true) {
  if (!canvasTextEditEl) return;
  const idx = canvasTextEditCardIdx;
  if (commit && idx != null && cards[idx]) {
    cards[idx].text = canvasTextEditEl.value;
    const wrap = cardsEl.querySelector(`[data-card-index="${idx}"]`);
    const ta = wrap?.querySelector('textarea[data-field="text"]');
    if (ta) {
      ta.value = cards[idx].text;
      autosizeTA(ta);
    }
    scheduleSaveProject();
  }
  canvasTextEditEl.remove();
  canvasTextEditEl = null;
  canvasTextEditCardIdx = null;
  if (!isPreviewing) refreshEditView();
}

function openCanvasTextEdit(cardIdx) {
  if (isPreviewing || !cards[cardIdx]) return;
  closeCanvasTextEdit(true);

  const card = cards[cardIdx];
  const { w, h } = getSettings();
  const style = getCardTextStyle(card);
  const tr = getTextRect(card, w, h, style);
  if (!tr) return;

  const wrap = previewFrame || canvas.parentElement;
  if (!wrap) return;

  const canvasRect = canvas.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const scaleX = canvasRect.width / w;
  const scaleY = canvasRect.height / h;

  const pos = getCardPos(card);
  let align = 'center';
  let vAlign = 'middle';
  if (pos.preset !== 'custom') {
    const anchor = presetToAnchor(pos.preset);
    align = anchor.align;
    vAlign = anchor.v;
  }

  const ta = document.createElement('textarea');
  ta.className = 'canvasTextEdit';
  ta.value = card.text || '';
  ta.spellcheck = false;
  ta.style.textAlign = align;

  const border = 4; // 2px border each side (box-sizing: border-box)
  const padX = 12;
  const padY = 10;
  const fontSize = Math.max(14, (style.fontSize || 48) * scaleY);
  const lineH = fontSize * 1.18;
  const contentW = tr.w * scaleX;
  const contentH = tr.h * scaleY;
  // Inner width must be >= canvas text width or the last word wraps early
  const wrapSlop = 18;
  const innerW = contentW + wrapSlop;
  const minOuterW = Math.max(240, Math.min(canvasRect.width * 0.5, 440));
  const width = Math.max(minOuterW, innerW + padX * 2 + border);
  // Extra line of height so a wrap (or font metric mismatch) doesn't clip
  const innerH = contentH + lineH;
  const height = Math.max(innerH + padY * 2 + border, lineH * 2 + padY * 2 + border, 72);

  const textLeft = canvasRect.left - wrapRect.left + tr.left * scaleX;
  const textTop = canvasRect.top - wrapRect.top + tr.top * scaleY;
  const textRight = textLeft + contentW;
  const textBottom = textTop + contentH;
  const textCenterX = textLeft + contentW / 2;

  let left;
  if (align === 'left') left = textLeft - padX;
  else if (align === 'right') left = textRight + padX - width;
  else left = textCenterX - width / 2;

  // Pin first line to the canvas text top (avoids "half visible" from vertical centering)
  let top = textTop - padY;
  if (vAlign === 'bottom') top = textBottom + padY - height;

  left = clamp(left, 6, Math.max(6, wrapRect.width - width - 6));
  top = clamp(top, 6, Math.max(6, wrapRect.height - height - 6));

  ta.style.left = `${left}px`;
  ta.style.top = `${top}px`;
  ta.style.width = `${width}px`;
  ta.style.height = `${height}px`;
  ta.style.fontSize = `${fontSize}px`;
  ta.style.lineHeight = '1.18';
  ta.style.padding = `${padY}px ${padX}px`;
  ta.style.minWidth = `${Math.min(240, width)}px`;
  ta.style.minHeight = `${Math.min(72, height)}px`;
  ta.style.boxSizing = 'border-box';

  ta.addEventListener('input', () => {
    card.text = ta.value;
    const cardTa = cardsEl.querySelector(`[data-card-index="${cardIdx}"] textarea[data-field="text"]`);
    if (cardTa) {
      cardTa.value = ta.value;
      autosizeTA(cardTa);
    }
    // Grow if content wraps taller than the box
    const need = ta.scrollHeight;
    if (need > ta.clientHeight + 1) {
      const nextH = Math.min(need + 2, wrapRect.height - 12);
      ta.style.height = `${nextH}px`;
    }
    scheduleSaveProject();
  });

  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeCanvasTextEdit(true);
    }
  });

  ta.addEventListener('blur', () => {
    setTimeout(() => closeCanvasTextEdit(true), 0);
  });

  wrap.appendChild(ta);
  canvasTextEditEl = ta;
  canvasTextEditCardIdx = cardIdx;
  refreshEditView();
  // If font metrics still wrap, grow once after layout
  requestAnimationFrame(() => {
    if (canvasTextEditEl !== ta) return;
    const need = ta.scrollHeight;
    if (need > ta.clientHeight + 1) {
      ta.style.height = `${Math.min(need + 2, wrapRect.height - 12)}px`;
    }
  });
  ta.focus();
  ta.select();
}

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
  scheduleSaveProject();
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
  const editingThis = canvasTextEditCardIdx === active.idx;

  if (!text) {
    drawEditChrome(card, w, h);
    if (enableGrain) drawGrain(w, h);
    return;
  }

  const textStyle = getCardTextStyle(card);
  if (!editingThis) {
    drawCardText(card, w, h, contentAlpha, { ...textStyle, tSeconds, active });
  }
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
  if (tr && canvasTextEditCardIdx !== selectedCardIndex) {
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
  canvas.addEventListener('dblclick', (e) => {
    if (isPreviewing) return;
    const idx = selectedCardIndex ?? getIdlePreviewCardIndex();
    if (idx < 0 || !cards[idx]) return;
    const { w, h } = getSettings();
    const p = canvasPointFromEvent(e);
    const hit = hitTestEdit(p.x, p.y, cards[idx], w, h);
    if (hit?.kind === 'text') {
      e.preventDefault();
      if (selectedCardIndex == null) setSelectedCard(idx);
      openCanvasTextEdit(idx);
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (isPreviewing) return;

    const { w, h } = getSettings();
    const p = canvasPointFromEvent(e);

    if (selectedCardIndex == null) {
      const idx = getIdlePreviewCardIndex();
      if (idx < 0) return;
      const card = cards[idx];
      const hit = hitTestEdit(p.x, p.y, card, w, h);
      if (hit) {
        setSelectedCard(idx);
        setStatus(`Editing card ${idx + 1}. Double-click text to edit in preview.`);
      }
      return;
    }

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
    if (editDrag) scheduleSaveProject();
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

btnBrowseAudio?.addEventListener('click', () => audioFile?.click());

audioFile.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) { clearAudio(); return; }
  if (audioObjectUrl) {
    try { URL.revokeObjectURL(audioObjectUrl); } catch {}
  }
  audioObjectUrl = URL.createObjectURL(file);
  audioPlayer.src = audioObjectUrl;
  audioPlayer.load();
  syncAudioUi(file.name);
  scheduleSaveProject(true);
});

btnClearAudio?.addEventListener('click', clearAudio);
btnClearBg?.addEventListener('click', clearBackground);

btnBrowseBg?.addEventListener('click', () => bgFile?.click());

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

function attachBackgroundVideo(vid, url, displayName, { restored = false } = {}) {
  let ready = false;
  const onReady = () => {
    if (ready) return;
    ready = true;
    bg = { type: 'video', url, el: vid };
    syncBgVideoControls();
    try { vid.currentTime = 0; } catch {}
    try { vid.pause(); } catch {}
    syncBgUi(displayName, { restored });
    refreshCanvasFromSettings();
    scheduleSaveProject(true);
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
    clearBackground();
    return;
  }

  if (bg.url) URL.revokeObjectURL(bg.url);
  const url = URL.createObjectURL(file);

  if (isImageFile(file)) {
    const img = new Image();
    img.onload = () => {
      bg = { type: 'image', url, el: img };
      syncBgVideoControls();
      syncBgUi(file.name);
      refreshCanvasFromSettings();
      scheduleSaveProject(true);
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
    attachBackgroundVideo(vid, url, file.name);
    return;
  }

  setStatus('Unsupported background file. Try MP4, WebM, MOV, PNG, or JPG.');

  bg = { type: 'none', url: null, el: null };
  syncBgVideoControls();
  syncBgUi();
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
    scheduleSaveProject();
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
    scheduleSaveProject();
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
        <div class="cardImageControls">
          <input data-field="image" type="file" accept="image/*" />
          <button type="button" class="btn small secondary" data-act="browse">Browse image</button>
          <button type="button" class="btn small secondary" data-act="clear-image" style="display:none;">Clear</button>
        </div>
        <span class="cardImageName" data-field="image-name">No image</span>
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
      scheduleSaveProject();
      if (!isPreviewing) redrawIdle();
    });

    dur.addEventListener('input', () => {
      cards[idx].duration = Math.max(0.1, Number(dur.value || 0.1));
      syncDurationSuggest();
      updateMeta();
      scheduleSaveProject();
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
      scheduleSaveProject();
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
  scheduleSaveProject();
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
      pos: { preset: 'center', x: 0.5, y: 0.5, dvd: false },
      fontSize: 96,
    },
  ];
  selectedCardIndex = 0;
  lastSelectedCardIndex = 0;
  renderCardsUI();
  if (!isPreviewing) redrawIdle();
  scheduleSaveProject();
}

async function buildTemplateRecord(name) {
  const project = await serializeProject();
  return {
    kind: TEMPLATE_KIND,
    version: TEMPLATE_VERSION,
    name: normalizeTemplateName(name),
    savedAt: new Date().toISOString(),
    cards: project.cards,
    settings: project.settings,
    audio: project.audio,
    background: project.background,
    selectedCardIndex: project.selectedCardIndex,
    lastSelectedCardIndex: project.lastSelectedCardIndex,
  };
}

async function refreshTemplatesUi(preferredName) {
  if (!templateSelect) return;
  let templates = [];
  try { templates = await idbListTemplateNames(); } catch {}
  const prev = preferredName || templateSelect.value;
  templateSelect.innerHTML = '';
  updateTemplatesToggleLabel(templates.length);

  if (!templates.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No templates saved';
    templateSelect.appendChild(opt);
    templateSelect.disabled = true;
    if (btnLoadTemplate) btnLoadTemplate.disabled = true;
    if (btnDeleteTemplate) btnDeleteTemplate.disabled = true;
    if (btnExportTemplate) btnExportTemplate.disabled = true;
    return;
  }
  templateSelect.disabled = false;
  for (const t of templates) {
    const opt = document.createElement('option');
    opt.value = t.name;
    const bits = ['cards'];
    if (t.audio?.dataUrl) bits.push('audio');
    if (t.background?.dataUrl) bits.push('background');
    opt.textContent = `${t.name} (${bits.join(', ')})`;
    templateSelect.appendChild(opt);
  }
  const match = templates.find((t) => t.name === prev);
  templateSelect.value = match ? match.name : templates[0].name;
  const hasSel = !!templateSelect.value;
  if (btnLoadTemplate) btnLoadTemplate.disabled = !hasSel;
  if (btnDeleteTemplate) btnDeleteTemplate.disabled = !hasSel;
  if (btnExportTemplate) btnExportTemplate.disabled = !hasSel;
}

function updateTemplatesToggleLabel(count) {
  if (!btnTemplates) return;
  btnTemplates.textContent = count > 0 ? `Templates (${count})` : 'Templates';
}

function isTemplatesPanelOpen() {
  return !!(templatesPanel && !templatesPanel.hidden);
}

function setTemplatesPanelOpen(open) {
  if (!templatesPanel || !btnTemplates) return;
  templatesPanel.hidden = !open;
  btnTemplates.setAttribute('aria-expanded', open ? 'true' : 'false');
  btnTemplates.classList.toggle('btnTemplatesActive', open);
  try {
    localStorage.setItem(TEMPLATES_PANEL_KEY, open ? '1' : '0');
  } catch {}
}

function initTemplatesPanel() {
  let open = false;
  try { open = localStorage.getItem(TEMPLATES_PANEL_KEY) === '1'; } catch {}
  setTemplatesPanelOpen(open);
}

btnTemplates?.addEventListener('click', () => {
  setTemplatesPanelOpen(!isTemplatesPanelOpen());
});

async function saveCurrentAsTemplate(name) {
  const normalized = normalizeTemplateName(name);
  if (!normalized) {
    setStatus('Enter a template name.');
    return false;
  }
  if (!cards.length) {
    setStatus('Add at least one card before saving a template.');
    return false;
  }
  const existing = await idbGetTemplate(normalized).catch(() => null);
  if (existing) {
    const ok = await showConfirm(
      `Replace the saved template "${normalized}"?`,
      { title: 'Overwrite template?', confirmLabel: 'Replace' }
    );
    if (!ok) return false;
  }
  const record = await buildTemplateRecord(normalized);
  await idbSetTemplate(normalized, record);
  await refreshTemplatesUi(normalized);
  const bits = ['cards'];
  if (record.audio?.dataUrl) bits.push('audio');
  if (record.background?.dataUrl) bits.push('background');
  setStatus(`Template "${normalized}" saved (${bits.join(', ')}).`);
  return true;
}

async function loadSelectedTemplate() {
  const name = templateSelect?.value;
  if (!name) return;
  const data = await idbGetTemplate(name);
  if (!data?.cards?.length) {
    setStatus('Template not found or empty.');
    return;
  }
  if (projectHasContent()) {
    const ok = await showConfirm(
      describeTemplateLoad(data),
      { title: 'Load template?', confirmLabel: 'Load template' }
    );
    if (!ok) return;
  }
  const ok = await applyProjectData(data, { mode: 'template' });
  if (!ok) {
    setStatus('Could not load template.');
    return;
  }
  scheduleSaveProject(true);
  setStatus(`Loaded template "${data.name}". Edit the cards and export when ready.`);
}

btnSaveTemplate?.addEventListener('click', async () => {
  const name = await showPrompt(
    'Save your current cards and settings as a reusable template.',
    { title: 'Save as template', label: 'Template name', confirmLabel: 'Save template' }
  );
  if (name == null) return;
  await saveCurrentAsTemplate(name);
});

btnLoadTemplate?.addEventListener('click', () => { loadSelectedTemplate(); });

templateSelect?.addEventListener('change', () => {
  const hasSel = !!templateSelect.value;
  if (btnLoadTemplate) btnLoadTemplate.disabled = !hasSel;
  if (btnDeleteTemplate) btnDeleteTemplate.disabled = !hasSel;
  if (btnExportTemplate) btnExportTemplate.disabled = !hasSel;
});

btnDeleteTemplate?.addEventListener('click', async () => {
  const name = templateSelect?.value;
  if (!name) return;
  const ok = await showConfirm(
    `Delete template "${name}" from this browser?\n\nThis cannot be undone.`,
    { title: 'Delete template?', confirmLabel: 'Delete' }
  );
  if (!ok) return;
  await idbDeleteTemplate(name);
  await refreshTemplatesUi();
  setStatus(`Deleted template "${name}".`);
});

btnExportTemplate?.addEventListener('click', async () => {
  const name = templateSelect?.value;
  if (!name) return;
  const data = await idbGetTemplate(name);
  if (!data) {
    setStatus('Template not found.');
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugifyTemplateName(name)}.ahoy.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus(`Exported template "${name}".`);
});

btnImportTemplate?.addEventListener('click', () => {
  templateImportFile?.click();
});

templateImportFile?.addEventListener('change', async () => {
  const file = templateImportFile.files?.[0];
  templateImportFile.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!isValidTemplateData(data)) {
      setStatus('Not a valid [ahoy] template file.');
      return;
    }
    const name = normalizeTemplateName(data.name);
    const existing = await idbGetTemplate(name).catch(() => null);
    if (existing) {
      const ok = await showConfirm(
        `A template named "${name}" already exists.\n\nReplace it with the imported file?`,
        { title: 'Overwrite template?', confirmLabel: 'Replace' }
      );
      if (!ok) return;
    }
    const record = {
      ...data,
      name,
      kind: TEMPLATE_KIND,
      version: TEMPLATE_VERSION,
      savedAt: data.savedAt || new Date().toISOString(),
    };
    await idbSetTemplate(name, record);
    await refreshTemplatesUi(name);
    setStatus(`Imported template "${name}".`);
  } catch {
    setStatus('Could not read template file.');
  }
});

btnLoadExample.addEventListener('click', async () => {
  if (cards.length) {
    const ok = await showConfirm(
      'Your current cards will be replaced.\n\nAudio and background will stay.',
      { title: 'Load example?', confirmLabel: 'Load example' }
    );
    if (!ok) return;
  }
  await clearProjectStorage();
  loadExampleCards();
});

btnClear.addEventListener('click', async () => {
  if (!cards.length) return;
  const ok = await showConfirm(
    'Your cards will be lost.\n\nAudio and background will stay.',
    { title: 'Clear cards?', confirmLabel: 'Clear cards' }
  );
  if (!ok) return;
  cards.forEach(revokeCardImage);
  cards = [];
  selectedCardIndex = null;
  lastSelectedCardIndex = null;
  await clearProjectStorage();
  renderCardsUI();
  drawFrame(0);
});

btnClearAll?.addEventListener('click', async () => {
  if (!projectHasContent()) return;
  const ok = await showConfirm(
    'Cards, audio, and background will be lost.',
    { title: 'Clear all?', confirmLabel: 'Clear all' }
  );
  if (!ok) return;
  clearAudio({ skipSave: true });
  clearBackground({ skipSave: true });
  cards.forEach(revokeCardImage);
  cards = [];
  selectedCardIndex = null;
  lastSelectedCardIndex = null;
  await clearProjectStorage();
  renderCardsUI();
  drawFrame(0);
  setStatus('Cleared. Add a card or load the example to start.');
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
          `FFmpeg init timed out after ${timeoutMs / 1000}s. Use the Docker image for server-side export, or try Chrome or Edge.`
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

let serverMuxAvailableCache = null;

async function isServerMuxAvailable() {
  if (serverMuxAvailableCache !== null) return serverMuxAvailableCache;
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    serverMuxAvailableCache = res.ok;
  } catch {
    serverMuxAvailableCache = false;
  }
  return serverMuxAvailableCache;
}

async function muxToMp4OnServer(webmBlob, audioFileObjOrNull) {
  setStatus('Converting to MP4 on server...');
  const form = new FormData();
  form.append('video', webmBlob, 'bump.webm');
  if (audioFileObjOrNull) {
    form.append('audio', audioFileObjOrNull, audioFileObjOrNull.name || 'audio.bin');
  }
  const res = await fetch('/api/mux-mp4', { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Server mux failed (${res.status})`);
  }
  setProgress(0.95);
  return await res.blob();
}

async function muxToMp4(webmBlob, audioFileObjOrNull) {
  if (await isServerMuxAvailable()) {
    return muxToMp4OnServer(webmBlob, audioFileObjOrNull);
  }

  await loadFFmpegIfNeeded();
  setStatus('Converting to MP4 in browser...');

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
  el.addEventListener('change', () => { updateMeta(); refreshCanvasFromSettings(); scheduleSaveProject(); });
  el.addEventListener('input',  () => { updateMeta(); refreshCanvasFromSettings(); scheduleSaveProject(); });
}

resolutionSel?.addEventListener('change', () => {
  scaleFontSizeOnResolutionChange();
  updateMeta();
  refreshCanvasFromSettings();
  scheduleSaveProject();
});

async function initApp() {
  initFontResolutionTracking();
  syncBgVideoControls();
  syncAudioUi();
  syncBgUi();

  const restored = await loadProjectFromStorage();
  if (!restored) loadExampleCards();

  initTemplatesPanel();
  await refreshTemplatesUi();

  updateMeta();
  updateActionButtons();
  setStatus(restored
    ? 'Restored your last draft. Double-click text in the preview to edit.'
    : 'Select a card, then drag text (gold) or image (blue) in the preview.');
}

function setupDeselectHandlers() {
  document.addEventListener('click', (e) => {
    if (selectedCardIndex == null) return;
    if (e.target.closest('.cardItem')) return;
    if (e.target.closest('button, a')) return;
    if (e.target.closest('#canvas, .canvasWrapTop, #resultVideo, .canvasTextEdit')) return;
    deselectCard();
  });
}

setupCanvasEditHandlers();
setupDeselectHandlers();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    clearTimeout(saveProjectTimer);
    saveProjectToStorage();
  }
});

initApp();