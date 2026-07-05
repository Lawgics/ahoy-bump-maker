import express from 'express';
import multer from 'multer';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 },
});

const app = express();

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mux: 'ffmpeg' });
});

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
    });
  });
}

app.post('/api/mux-mp4', upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'audio', maxCount: 1 },
]), async (req, res) => {
  const video = req.files?.video?.[0];
  if (!video) {
    res.status(400).send('Missing video file');
    return;
  }

  const audio = req.files?.audio?.[0];
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ahoy-'));
  const videoPath = path.join(tmpDir, 'input.webm');
  const audioPath = audio ? path.join(tmpDir, `audio.${extFromName(audio.originalname)}`) : null;
  const outputPath = path.join(tmpDir, 'output.mp4');

  try {
    await fs.writeFile(videoPath, video.buffer);
    if (audio && audioPath) await fs.writeFile(audioPath, audio.buffer);

    const args = ['-y', '-i', videoPath];
    if (audioPath) args.push('-i', audioPath);

    args.push(
      '-map', '0:v:0',
      ...(audioPath ? ['-map', '1:a:0'] : []),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      ...(audioPath ? ['-c:a', 'aac'] : ['-an']),
      ...(audioPath ? ['-shortest'] : []),
      '-movflags', '+faststart',
      outputPath,
    );

    await runFfmpeg(args);
    const mp4 = await fs.readFile(outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="bump.mp4"');
    res.send(mp4);
  } catch (err) {
    console.error(err);
    res.status(500).send(String(err?.message || err));
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

app.use(express.static(publicDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = Number(process.env.PORT || 80);
app.listen(port, '0.0.0.0', () => {
  console.log(`[ahoy] listening on :${port}`);
});

function extFromName(name) {
  const m = (name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : 'bin';
}
