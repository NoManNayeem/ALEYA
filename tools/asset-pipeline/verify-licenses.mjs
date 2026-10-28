#!/usr/bin/env node
/**
 * Dependency license gate: every production dependency (transitively) must use an
 * allowed license. Also writes apps/web/public/licenses/THIRD_PARTY_NOTICES.txt so
 * the in-game Licenses screen can show the full notices without network access.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = ['MIT', 'OFL-1.1', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'CC0-1.0'];
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const seen = new Map();
function visit(name) {
  if (seen.has(name)) return;
  const dir = join('node_modules', name);
  const pj = join(dir, 'package.json');
  if (!existsSync(pj)) return;
  const pkg = JSON.parse(readFileSync(pj, 'utf8'));
  const lic = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'UNKNOWN';
  const licFile = readdirSync(dir).find((f) => /^(licen[cs]e|copying)/i.test(f));
  seen.set(name, { version: pkg.version, license: lic, text: licFile ? readFileSync(join(dir, licFile), 'utf8') : '' });
  for (const d of Object.keys(pkg.dependencies ?? {})) visit(d);
}
for (const d of Object.keys(root.dependencies ?? {})) visit(d);
const bad = [...seen].filter(([, v]) => !ALLOWED.includes(v.license));
const missingText = [...seen].filter(([, v]) => !v.text);
mkdirSync('apps/web/public/licenses', { recursive: true });
const notices = [...seen]
  .sort()
  .map(([n, v]) => `==== ${n}@${v.version} (${v.license}) ====\n\n${v.text || '(license text not bundled by package)'}\n`)
  .join('\n');
writeFileSync('apps/web/public/licenses/THIRD_PARTY_NOTICES.txt', `ALEYA: The Last Ferry — third-party notices\nGenerated ${new Date().toISOString().slice(0, 10)}\n\n${notices}`);
if (bad.length) {
  console.error('License check FAILED:\n  ' + bad.map(([n, v]) => `${n}: ${v.license}`).join('\n  '));
  process.exit(1);
}
if (missingText.length) console.warn('warning: no license file in ' + missingText.map(([n]) => n).join(', '));
console.log(`License check passed: ${seen.size} production packages (${[...new Set([...seen.values()].map((v) => v.license))].join(', ')}).`);
