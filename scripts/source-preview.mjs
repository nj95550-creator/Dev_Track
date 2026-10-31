/**
 * Generate the public source browser from allowlisted source files. Text is
 * HTML-escaped for display and also written as plain-text copies; only the
 * generated source output folder is replaced, never application data.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { releaseEntries } from './release-files.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'frontend/public/source');
// Display source as text rather than executable markup; raw downloads use .txt.
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
// Reuse the packaging allowlist so private files and this generated output
// cannot be exposed through the public source browser.
const entries = await releaseEntries(root);
// Replace only the reproducible source-browser folder before writing fresh copies.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const files = Object.entries(entries).filter(([name]) => !/\.(png|ico|woff2?|jpg|webp|pdf)$/i.test(name));
const sections = [];
for (const [name, data] of files) {
  const path = name.slice('DevTrack/'.length);
  const raw = `files/${path}.txt`;
  await mkdir(join(output, raw, '..'), { recursive: true });
  await writeFile(join(output, raw), data);
  sections.push(`<details><summary>${escape(path)}</summary><a href="/source/${escape(raw)}">Open raw file</a><pre><code>${escape(new TextDecoder().decode(data))}</code></pre></details>`);
}
// Native details elements provide code expansion without a client-side script.
await writeFile(join(output, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Source code · DevTrack</title><link rel="stylesheet" href="/source/source.css"><link rel="icon" href="/favicon.svg"></head>
<body><header><a href="/">← DevTrack</a><p>THE IMPLEMENTATION</p><h1>Explore the source.</h1><p>The actual source bundled with this version of DevTrack. Expand a file to read it, or open its raw text. This build-generated snapshot excludes credentials, databases, dependencies, and build output.</p></header><main aria-label="Source files">${sections.join('\n')}</main><footer><a href="/">Back to the app</a></footer></body></html>`);
await writeFile(join(output, 'source.css'), `:root{color-scheme:light dark;font-family:system-ui,sans-serif;background:light-dark(#f8f9fa,#181b1d);color:light-dark(#282a29,#eceeed)}body{max-width:1050px;margin:auto;padding:36px 20px}header{max-width:740px;margin-bottom:36px}h1{font-size:48px;letter-spacing:-2px}p{line-height:1.8}a{color:light-dark(#a94823,#ed956c);text-underline-offset:4px}details{border:1px solid light-dark(#ccd1d3,#434e52);border-radius:6px;margin:10px 0;padding:14px}summary{cursor:pointer;font-family:ui-monospace,monospace;overflow-wrap:anywhere}details>a{display:block;margin:16px 0}pre{padding:16px;background:light-dark(#fff,#202528);overflow:auto;max-height:600px;font-size:13px;tab-size:2}footer{margin-top:32px}:focus-visible{outline:3px solid #d0754e;outline-offset:4px}@media(max-width:600px){h1{font-size:36px}body{padding:24px 12px}}`);
console.log(`Source browser generated from ${files.length} allowlisted files.`);
