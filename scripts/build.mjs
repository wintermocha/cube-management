import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/src/lib', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('src/app.js', 'dist/src/app.js');
await cp('src/lib', 'dist/src/lib', { recursive: true });
console.log('Built static Cloudflare Pages app into dist/');
