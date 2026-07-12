import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('.omo/evidence/full-mobile-audit');
const output = path.join(root, 'final', 'integrity-manifest.json');
const projects = {
  'responsive-375': [375, 812], 'responsive-390': [390, 844],
  'responsive-768': [768, 1024], 'responsive-1280': [1280, 900],
};
const productFiles = ['DESIGN.md', 'functions/api/[[path]].js', 'public/index.html', 'public/styles.css', 'src/app.js', 'src/lib/api-state.js', 'src/lib/auth-navigation.js', 'src/lib/bindings.js', 'src/lib/domain.js', 'src/lib/meal-table-view.js', 'src/lib/safe-storage.js', 'src/lib/view.js'];

async function hash(file) { return createHash('sha256').update(await readFile(file)).digest('hex'); }
async function fingerprint(file) { const details = await stat(file); return { file, sha256: await hash(file), mtimeMs: details.mtimeMs, mtime: details.mtime.toISOString() }; }
async function files(directory, suffix) { return (await readdir(directory)).filter((name) => name.endsWith(suffix)).sort(); }

const sourceStart = await Promise.all(productFiles.map(fingerprint));
const latestSourceMtimeMs = Math.max(...sourceStart.map((entry) => entry.mtimeMs));
const canonical = [];
const special = [];
for (const [project, dimensions] of Object.entries(projects)) {
  const directory = path.join(root, 'final', 'canonical-35', project);
  const [pngs, jsons] = await Promise.all([files(directory, '.png'), files(directory, '.json')]);
  if (pngs.length !== 35 || jsons.length !== 35) throw new Error(`${project}: expected 35 PNG + 35 JSON, got ${pngs.length} + ${jsons.length}`);
  for (const png of pngs) {
    const stem = png.replace(/\.png$/, '');
    if (!jsons.includes(`${stem}.json`)) throw new Error(`${project}: missing JSON for ${png}`);
    const pngPath = path.join(directory, png); const jsonPath = path.join(directory, `${stem}.json`);
    const [image, manifest, imageStat, jsonStat] = await Promise.all([sharp(pngPath).metadata(), readFile(jsonPath, 'utf8').then(JSON.parse), stat(pngPath), stat(jsonPath)]);
    if (image.width !== dimensions[0] || image.height !== dimensions[1]) throw new Error(`${project}/${png}: ${image.width}x${image.height}`);
    if (imageStat.mtimeMs < latestSourceMtimeMs || jsonStat.mtimeMs < latestSourceMtimeMs) throw new Error(`${project}/${png}: stale evidence`);
    if (manifest.diagnostics.length || manifest.observables.clipped.length || manifest.observables.undersized.length) throw new Error(`${project}/${png}: failed observables`);
    if (!manifest.assets.allDecoded || !manifest.assets.avatarRendered) throw new Error(`${project}/${png}: image readiness failed`);
    canonical.push({ project, png, pngSha256: await hash(pngPath), jsonSha256: await hash(jsonPath), width: image.width, height: image.height, mtime: imageStat.mtime.toISOString() });
  }
  const specialDirectory = path.join(root, 'final', project);
  const [specialPngs, specialJsons] = await Promise.all([files(specialDirectory, '.png'), files(specialDirectory, '.json')]);
  if (specialPngs.length !== 19 || specialJsons.length !== 19) throw new Error(`${project}: expected 19 special PNG + 19 JSON, got ${specialPngs.length} + ${specialJsons.length}`);
  for (const png of specialPngs) {
    const stem = png.replace(/\.png$/, ''); const pngPath = path.join(specialDirectory, png); const jsonPath = path.join(specialDirectory, `${stem}.json`);
    if (!specialJsons.includes(`${stem}.json`)) throw new Error(`${project}: missing special JSON for ${png}`);
    const [image, manifest, imageStat, jsonStat] = await Promise.all([sharp(pngPath).metadata(), readFile(jsonPath, 'utf8').then(JSON.parse), stat(pngPath), stat(jsonPath)]);
    if (image.width !== dimensions[0] || image.height !== dimensions[1]) throw new Error(`${project}/${png}: invalid special image dimensions`);
    if (imageStat.mtimeMs < latestSourceMtimeMs || jsonStat.mtimeMs < latestSourceMtimeMs) throw new Error(`${project}/${png}: stale special evidence`);
    if (!manifest.assets.allDecoded || !manifest.assets.avatarRendered) throw new Error(`${project}/${png}: special image readiness failed`);
    special.push({ project, png, pngSha256: await hash(pngPath), jsonSha256: await hash(jsonPath), width: image.width, height: image.height, mtime: imageStat.mtime.toISOString() });
  }
}

const zoomDirectory = path.join(root, 'final', 'zoom');
const zoomPngs = await files(zoomDirectory, '.png');
if (zoomPngs.length !== 24) throw new Error(`Expected 24 zoom PNGs, found ${zoomPngs.length}`);
const zoomManifest = JSON.parse(await readFile(path.join(zoomDirectory, 'runtime-manifest.json'), 'utf8'));
if (zoomManifest.screenshotCount !== 24 || zoomManifest.failures.length) throw new Error(`Zoom manifest failed: ${JSON.stringify(zoomManifest.failures)}`);
const zoom = await Promise.all(zoomPngs.map(async (name) => {
  const file = path.join(zoomDirectory, name); const details = await stat(file); const image = await sharp(file).metadata();
  if (details.mtimeMs < latestSourceMtimeMs) throw new Error(`${name}: stale zoom evidence`);
  return { name, sha256: await hash(file), width: image.width, height: image.height, mtime: details.mtime.toISOString() };
}));

const touchRoot = path.join(root, 'final', 'touch', 'mobile-chromium');
const touchManifestPath = path.join(touchRoot, 'pixel7-tap-matrix.json');
const touchPngPath = path.join(touchRoot, 'pixel7-tap-matrix.png');
const [touchManifest, touchPngStat] = await Promise.all([readFile(touchManifestPath, 'utf8').then(JSON.parse), stat(touchPngPath)]);
if (touchManifest.observables.tapCount < 25 || touchManifest.runtime.maxTouchPoints < 1 || !touchManifest.runtime.coarsePointer || touchManifest.runtime.devicePixelRatio <= 1) throw new Error('Pixel touch receipt failed');
if (touchManifest.diagnostics.length || touchPngStat.mtimeMs < latestSourceMtimeMs) throw new Error('Pixel touch receipt is stale or has diagnostics');
const touch = { tapCount: touchManifest.observables.tapCount, putCount: touchManifest.observables.putCount, runtime: touchManifest.runtime, pngSha256: await hash(touchPngPath), jsonSha256: await hash(touchManifestPath) };

const diffs = JSON.parse(await readFile(path.join(root, 'final', 'diffs', 'manifest.json'), 'utf8'));
if (diffs.pairCount !== 18 || diffs.pairs.some((pair) => !pair.hotspots || !pair.diffBoundingBox)) throw new Error('D01-D10 diff manifest incomplete');
const afterPairs = [];
for (const pair of diffs.pairs) {
  const actual = path.resolve(pair.actualPath); const details = await stat(actual);
  if (details.mtimeMs < latestSourceMtimeMs) throw new Error(`${pair.actualPath}: stale AFTER evidence`);
  afterPairs.push({ criterion: pair.criterion, filename: pair.filename, originalBeforeSha256: pair.originalReferenceSha256, beforeSha256: pair.referenceSha256, beforeByteIdenticalToOriginal: pair.referenceByteIdenticalToOriginal, afterSha256: pair.actualSha256, diffRatio: pair.diffRatio, bbox: pair.diffBoundingBox });
}
const d04ReceiptJsonPath = path.join(root, 'final', 'd04-rebaseline-receipt.json');
const d04ReceiptMarkdownPath = path.join(root, 'final', 'd04-rebaseline-receipt.md');
const d04Receipt = JSON.parse(await readFile(d04ReceiptJsonPath, 'utf8'));
const nonIdenticalReferences = afterPairs.filter((pair) => !pair.beforeByteIdenticalToOriginal);
if (d04Receipt.disposition !== 'accepted_as_documented_deterministic_rebaseline' || d04Receipt.immutableRecovery !== false) throw new Error('D04 rebaseline receipt classification is invalid');
if (nonIdenticalReferences.length !== 1 || nonIdenticalReferences[0].criterion !== 'D04') throw new Error('D04 must be the sole deterministic rebaseline');

const sourceEnd = await Promise.all(productFiles.map(fingerprint));
if (JSON.stringify(sourceStart) !== JSON.stringify(sourceEnd)) throw new Error('Product source changed while integrity manifest was generated');
const textFiles = [...canonical.map((entry) => path.join(root, 'final', 'canonical-35', entry.project, entry.png.replace(/\.png$/, '.json'))), ...special.map((entry) => path.join(root, 'final', entry.project, entry.png.replace(/\.png$/, '.json'))), path.join(zoomDirectory, 'runtime-manifest.json'), touchManifestPath, d04ReceiptJsonPath];
const privacyMatches = [];
for (const file of textFiles) {
  const value = await readFile(file, 'utf8');
  if (/@(?:gmail|naver|daum|kakao|outlook|hotmail)\./i.test(value) || /authorization|access[_-]?token|cookie\s*[:=]/i.test(value)) privacyMatches.push(path.relative(process.cwd(), file));
}
if (privacyMatches.length) throw new Error(`Privacy scan failed: ${privacyMatches.join(', ')}`);

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({
  generatedAt: new Date().toISOString(), verdict: 'PASS with one documented deterministic rebaseline', fixture: 'safe deterministic QA fixture; example.invalid identities; blank profile notes',
  sourceQuiescent: true, sourceFiles: sourceEnd, latestSourceMtime: new Date(latestSourceMtimeMs).toISOString(),
  counts: { canonicalPng: canonical.length, canonicalJson: canonical.length, specialPng: special.length, specialJson: special.length, zoomPng: zoom.length, d01d10Pairs: afterPairs.length, touchTapActions: touch.tapCount },
  evidenceProvenance: { immutableReferenceCount: 17, deterministicRebaselineCount: 1, rebaselineCriterion: 'D04', immutableRecovery: false, receiptJson: path.relative(process.cwd(), d04ReceiptJsonPath), receiptJsonSha256: await hash(d04ReceiptJsonPath), receiptMarkdown: path.relative(process.cwd(), d04ReceiptMarkdownPath), receiptMarkdownSha256: await hash(d04ReceiptMarkdownPath) },
  privacy: { pass: true, scannedTextManifestCount: textFiles.length, matches: [] }, canonical, special, zoom, touch, afterPairs,
}, null, 2)}\n`);
