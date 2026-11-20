import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = process.env.RMC_BUILD_DIR ? path.resolve(process.env.RMC_BUILD_DIR) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../build');
const files = {};
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Build symlinks are not allowed');
    if (entry.isDirectory()) await walk(absolute);
    else if (/\.(html|js|css)$/.test(entry.name)) {
      const name = path.relative(root, absolute).split(path.sep).join('/');
      const bytes = await readFile(absolute);
      if (bytes.length > 20 * 1024 * 1024) throw new Error('Release asset exceeds verification limit');
      files[name] = createHash('sha256').update(bytes).digest('hex');
    }
  }
}
await walk(root);
if (!files['index.html'] || !Object.keys(files).some(p => /^static\/js\/main\.[^/]+\.js$/.test(p))) throw new Error('Missing main-game index or main JS bundle');
if (Object.keys(files).length > 500) throw new Error('Too many release assets');
const manifest = { app: 'RMC CLASSICS', schema: 1, scope: 'web-artifact-match-only', files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) };
await writeFile(path.join(root, 'rmc-release.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Recorded ${Object.keys(files).length} frontend release asset hashes`);
