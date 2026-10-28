/**
 * Automated full-episode playthrough (QA): drives the debug API through every
 * mandatory interaction, puzzle, trigger, pursuit and scene transition, then the
 * chosen ending and credits. Usage: node tools/dev/playthrough.mjs [A|B] [url]
 */
import { chromium } from '@playwright/test';
const ending = process.argv[2] ?? 'B';
const url = process.argv[3] ?? 'http://localhost:5173/?debug';
const out = '/tmp/aleya-shots/play';
import { mkdirSync } from 'node:fs';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text()}`));
await page.goto(url);
await page.evaluate(() => localStorage.setItem('aleya.settings', JSON.stringify({ firstRunDone: true, quality: 'medium', language: 'en', subtitleLanguage: 'en' })));
await page.reload();
await page.waitForFunction(() => window.__aleya && document.querySelector('[data-test=new-game]'), null, { timeout: 30000 });
const A = (fn, arg) => page.evaluate(fn, arg);
await A(() => window.__aleya.speed(12));
await A(() => window.__aleya.newGame());
const t0 = Date.now();
let shots = 0;
const shot = async (name) => page.screenshot({ path: `${out}/${String(++shots).padStart(2, '0')}-${name}.png` });

/** Settle: handle any modal (documents, puzzles, choice, credits) and skip cinematics until idle. */
async function settle(label, maxMs = 90000) {
  const start = Date.now();
  let idle = 0;
  while (Date.now() - start < maxMs) {
    const s = await A(() => window.__aleya.state());
    if (await page.$('[data-test=doc-close]')) await page.click('[data-test=doc-close]').catch(() => {});
    else if (await page.$('[data-test^=puzzle-]')) {
      await page.waitForTimeout(250);
      await A(() => window.__aleya.solvePuzzle());
    } else if (await page.$(`[data-test=choice-${ending}]`)) await page.click(`[data-test=choice-${ending}]`);
    else if (await page.$('[data-test=credits-skip]')) await page.click('[data-test=credits-skip]');
    else if (await page.$('[data-test=error]')) return 'end';
    else if (await A(() => window.__aleya.canSkip())) await A(() => window.__aleya.skip());
    if (!s.busy && !s.modal && s.app === 'play') {
      if (++idle >= 4) return s;
    } else idle = 0;
    await page.waitForTimeout(150);
  }
  throw new Error(`stuck at ${label}: ${JSON.stringify(await A(() => window.__aleya.state()))}`);
}

async function interact(x, z, label) {
  await A(([x, z]) => window.__aleya.teleport(x, z), [x - 0.35, z]);
  await page.waitForTimeout(250);
  await A(() => window.__aleya.interact());
  await page.waitForTimeout(200);
  await settle(label);
}

async function walkTrigger(x, label, z = 0.2) {
  await A(([x, z]) => window.__aleya.teleport(x, z), [x, z]);
  await page.waitForTimeout(400);
  return settle(label);
}

const has = async (flag) => (await A(() => window.__aleya.state())).flags.includes(flag);
const expectFlag = async (flag) => {
  if (!(await has(flag))) throw new Error(`expected flag ${flag}; flags=${(await A(() => window.__aleya.state())).flags.join(',')}`);
};
const scene = async () => (await A(() => window.__aleya.state())).scene;
async function waitScene(id) {
  for (let i = 0; i < 200; i++) {
    if ((await scene()) === id && (await A(() => window.__aleya.state())).app === 'play') return settle(`enter ${id}`);
    await page.waitForTimeout(150);
  }
  throw new Error(`scene ${id} never loaded`);
}

// ---------------- L01
await waitScene('aleya.ep01.L01');
await shot('L01-start');
await interact(-5, -1.0, 'lantern');
await expectFlag('has.item.lantern');
await walkTrigger(6.5, 'static');
await interact(10.5, -1.3, 'radio');
await expectFlag('L01.mira_called');
await interact(15.25, -1.0, 'fuse');
await interact(15.85, -0.4, 'karim');
await interact(24.1, -1.3, 'breaker');
await expectFlag('L01.power_on');
await expectFlag('L01.gate_open');
await shot('L01-power');
await walkTrigger(41, 'L01 exit');
// ---------------- L02
await waitScene('aleya.ep01.L02');
await walkTrigger(6.4, 'notice');
await interact(4.5, 0.9, 'stub');
await interact(12.6, -1.2, 'roster');
await interact(19, -1.15, 'tea tab');
await interact(10.5, -1.2, 'ledger');
await expectFlag('L02.ledger_solved');
await interact(30.2, -1.2, 'tags');
await interact(28, -1.2, 'radio');
await expectFlag('L02.radio_solved');
await shot('L02-radio');
await interact(47.4, -1.2, 'memorial (optional)');
await interact(56.2, -0.6, 'hiding place');
await expectFlag('L02.map_found');
await walkTrigger(61, 'L02 exit');
// ---------------- L03
await waitScene('aleya.ep01.L03');
await interact(8, -0.8, 'sign');
await walkTrigger(19, 'mira valves');
await interact(22.1, -0.8, 'chalk');
await interact(25, -0.8, 'valves');
await expectFlag('L03.gate_solved');
await walkTrigger(42, 'chase start', 0.1);
await shot('L03-chase');
await A(() => window.__aleya.teleport(61, 0.2));
await page.waitForTimeout(800);
await settle('escape');
await expectFlag('L03.escaped');
await walkTrigger(71, 'L03 exit');
// ---------------- L04
await waitScene('aleya.ep01.L04');
await interact(10.4, -0.7, 'boat');
await interact(20.5, -0.7, 'shrine (optional)');
await walkTrigger(24.5, 'watch');
await shot('L04-watch');
await A(() => window.__aleya.teleport(48.5, 0.3));
await page.waitForTimeout(800);
await settle('passed');
await expectFlag('L04.passed_watch');
await walkTrigger(53, 'creek');
await interact(55.5, -0.4, 'signal');
await expectFlag('L04.lights_solved');
await walkTrigger(62, 'hull');
// ---------------- L05
await waitScene('aleya.ep01.L05');
await shot('L05-start');
await walkTrigger(10.2, 'board', 0.2);
await interact(17.5, -0.7, 'jackets');
await interact(24.6, -0.7, 'log');
await expectFlag('L05.clues_ready');
await interact(28, -0.7, 'reconstruct');
await expectFlag('L05.reconstructed');
await interact(42.6, -0.6, 'gears');
await interact(43.5, -0.6, 'lock');
await expectFlag('L05.lock_solved');
await walkTrigger(47.2, 'record', 0);
await expectFlag('L05.record_heard');
await shot('L05-chase');
await A(() => window.__aleya.teleport(67, 0.3));
await page.waitForTimeout(800);
await settle('escaped');
await expectFlag('L05.escaped');
await A(() => window.__aleya.teleport(70, 0.3));
const end = await settle('ending', 180000);
await shot('end');
const final = await A(() => window.__aleya.state());
console.log(JSON.stringify({ ending, end: end === 'end', complete: final.flags.includes('ep01.complete'), endingFlag: final.flags.find((f) => f.startsWith('ending.')), seconds: Math.round((Date.now() - t0) / 1000), errors }, null, 2));
await browser.close();
if (!final.flags.includes('ep01.complete') || errors.length) process.exit(1);
