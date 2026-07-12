import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const auditRoot = path.resolve('.omo/evidence/full-mobile-audit');
const beforeRoot = path.join(auditRoot, 'before');
const afterRoot = path.join(auditRoot, 'after');
const outputRoot = path.join(auditRoot, 'final', 'diffs');
const cli = '/Users/ted/.codex/plugins/cache/sisyphuslabs/omo/4.17.0/skills/visual-qa/scripts/visual-qa.mjs';
let previousReferences = new Map();
try {
  const previous = JSON.parse(await readFile(path.join(outputRoot, 'manifest.json'), 'utf8'));
  previousReferences = new Map(previous.pairs.map((pair) => [`${pair.criterion}/${pair.project}/${pair.filename}`, pair.originalReferenceSha256 || pair.referenceSha256]));
} catch {}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

async function exactBoundingBox(reference, actual) {
  const [left, right] = await Promise.all([
    sharp(reference).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(actual).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (left.info.width !== right.info.width || left.info.height !== right.info.height) return null;
  let minX = left.info.width; let minY = left.info.height; let maxX = -1; let maxY = -1; let diffPixels = 0;
  for (let y = 0; y < left.info.height; y += 1) {
    for (let x = 0; x < left.info.width; x += 1) {
      const offset = (y * left.info.width + x) * 4;
      let different = false;
      for (let channel = 0; channel < 4; channel += 1) {
        if (left.data[offset + channel] !== right.data[offset + channel]) { different = true; break; }
      }
      if (!different) continue;
      diffPixels += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return diffPixels === 0 ? { x: 0, y: 0, width: 0, height: 0, diffPixels: 0 }
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, diffPixels };
}

const pairs = [];
for (const criterion of (await readdir(beforeRoot)).filter((name) => /^D(?:0[1-9]|10)$/.test(name)).sort()) {
  const project = 'responsive-390';
  const directory = path.join(beforeRoot, criterion, project);
  for (const filename of (await readdir(directory)).filter((name) => name.endsWith('.png')).sort()) {
    const reference = path.join(directory, filename); const actual = path.join(afterRoot, criterion, project, filename);
    const outputDirectory = path.join(outputRoot, criterion, project); await mkdir(outputDirectory, { recursive: true });
    const shared = JSON.parse(execFileSync('node', [cli, 'image-diff', reference, actual], { encoding: 'utf8' }));
    const originalReferenceSha256 = previousReferences.get(`${criterion}/${project}/${filename}`) || await sha256(reference);
    const result = {
      ...shared,
      criterion, project, filename,
      referencePath: path.relative(process.cwd(), reference), actualPath: path.relative(process.cwd(), actual),
      originalReferenceSha256, referenceSha256: await sha256(reference), actualSha256: await sha256(actual),
      referenceByteIdenticalToOriginal: originalReferenceSha256 === await sha256(reference),
      diffBoundingBox: await exactBoundingBox(reference, actual),
    };
    const output = path.join(outputDirectory, filename.replace(/\.png$/, '.diff.json'));
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
    pairs.push({ ...result, output: path.relative(process.cwd(), output) });
  }
}

if (pairs.length !== 18) throw new Error(`Expected 18 exact D01-D10 pairs, found ${pairs.length}`);
await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), pairCount: pairs.length, pairs }, null, 2)}\n`);
