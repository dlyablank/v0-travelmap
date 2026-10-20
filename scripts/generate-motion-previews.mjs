// Rebuild silent animated fallbacks from the attributed clips already in the repository.
// Run: node scripts/generate-motion-previews.mjs (requires FFmpeg with libwebp_anim).
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = fileURLToPath(new URL('../public/media/videos/', import.meta.url));
for (const source of readdirSync(directory).filter(
  (name) => name.endsWith('-preview.mp4') || ['kizhi.webm', 'koirinoja.webm'].includes(name),
)) {
  const id = source.replace(/(?:-preview)?\.(mp4|webm)$/, '');
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      join(directory, source),
      '-t',
      '4',
      '-vf',
      'fps=8,scale=160:-2',
      '-an',
      '-c:v',
      'libwebp_anim',
      '-quality',
      '55',
      '-loop',
      '0',
      join(directory, `${id}-motion.webp`),
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
