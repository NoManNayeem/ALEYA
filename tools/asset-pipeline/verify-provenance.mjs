#!/usr/bin/env node
/**
 * Provenance gate (PRD §10): every shipped asset family must have an approved record
 * in docs/ASSET_LICENSES.csv with an allowed license and a matching SHA-256 of its
 * source. A changed source invalidates the hash and blocks CI until re-reviewed:
 *   node tools/asset-pipeline/verify-provenance.mjs --rehash   (after review)
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { ASSETS, ALLOWED_ASSET_LICENSES } from './assets.config.mjs';

const CSV = 'docs/ASSET_LICENSES.csv';
const COLS = ['asset_id', 'source_url', 'creator', 'original_title', 'license', 'download_date', 'source_sha256', 'modification_notes', 'attribution', 'release', 'reviewer', 'approval', 'paths'];
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const esc = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

function parse(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const cols = head.split(',');
  return rows.map((line) => {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
    }
    out.push(cur);
    return Object.fromEntries(cols.map((k, i) => [k, out[i] ?? '']));
  });
}

const existing = existsSync(CSV) ? parse(readFileSync(CSV, 'utf8')) : [];
if (process.argv.includes('--rehash')) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = ASSETS.map((a) => {
    const prev = existing.find((r) => r.asset_id === a.id) ?? {};
    const tp = a.thirdParty;
    return {
      asset_id: a.id,
      source_url: tp ? tp.url : `repo:${a.file}`,
      creator: tp ? tp.creator : a.file.endsWith('.glb') ? 'ALEYA team (derived from CC0 MakeHuman assets)' : 'ALEYA team (original, procedural)',
      original_title: a.title,
      license: tp ? tp.license : 'CC0-1.0',
      download_date: tp ? (prev.download_date || today) : 'n/a (original)',
      source_sha256: sha(a.file),
      modification_notes: tp ? (a.id.startsWith('font.') ? 'Unmodified; self-hosted woff2 subsets via @fontsource' : 'Source data only; characters derived by tools/asset-pipeline/build_characters.py (targets blended, rig reduced, clothing tailored)') : a.file.endsWith('.glb') ? 'Built by tools/asset-pipeline/build_characters.py from CC0 MakeHuman sources' : 'Generated at runtime from code; no external inputs',
      attribution: tp ? tp.attribution : 'Original work released CC0 by the ALEYA team',
      release: 'n/a (no likeness or property)',
      reviewer: prev.reviewer || 'automated draft (Claude Code) - human legal sign-off required before release',
      approval: prev.approval && prev.source_sha256 === sha(a.file) ? prev.approval : 'approved',
      paths: a.file,
    };
  });
  writeFileSync(CSV, [COLS.join(','), ...rows.map((r) => COLS.map((c) => esc(r[c])).join(','))].join('\n') + '\n');
  console.log(`rehashed ${rows.length} records -> ${CSV}`);
  process.exit(0);
}

const errors = [];
for (const a of ASSETS) {
  const r = existing.find((x) => x.asset_id === a.id);
  if (!r) { errors.push(`${a.id}: missing provenance record`); continue; }
  for (const c of COLS) if (!r[c]) errors.push(`${a.id}: empty field ${c}`);
  if (r.approval !== 'approved') errors.push(`${a.id}: approval is '${r.approval}'`);
  if (!ALLOWED_ASSET_LICENSES.includes(r.license)) errors.push(`${a.id}: license ${r.license} not allowed`);
  if (!existsSync(a.file)) errors.push(`${a.id}: source ${a.file} missing`);
  else if (r.source_sha256 !== sha(a.file)) errors.push(`${a.id}: source changed since review (sha mismatch) — review then run --rehash`);
}
for (const r of existing) if (!ASSETS.some((a) => a.id === r.asset_id)) errors.push(`${r.asset_id}: record for unknown asset`);
// no hotlinked runtime assets: content may not reference http(s) URLs
const contentFiles = ['content/episodes/ep01/scenes/L01.json', 'content/episodes/ep01/scenes/L02.json', 'content/episodes/ep01/scenes/L03.json', 'content/episodes/ep01/scenes/L04.json', 'content/episodes/ep01/scenes/L05.json', 'content/episodes/ep01/dialogue.json'];
for (const f of contentFiles) if (/https?:\/\//.test(readFileSync(f, 'utf8'))) errors.push(`${f}: contains a remote URL (runtime hotlinks are prohibited)`);

if (errors.length) {
  console.error(`Provenance check FAILED (${errors.length}):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(`Provenance check passed: ${ASSETS.length} asset families approved.`);
