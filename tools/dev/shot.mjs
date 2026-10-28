import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://localhost:5173/?debug';
const out = '/tmp/aleya-shots';
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/01-title.png` });
const steps = JSON.parse(process.argv[3] ?? '[]');
for (const s of steps) {
  if (s.click) await page.click(s.click, { timeout: 8000 }).catch((e) => logs.push('[click-fail] ' + s.click + ' ' + e.message));
  if (s.key) await page.keyboard.press(s.key);
  if (s.down) await page.keyboard.down(s.down);
  if (s.up) await page.keyboard.up(s.up);
  if (s.eval) logs.push('[eval] ' + JSON.stringify(await page.evaluate(s.eval).catch((e) => 'ERR ' + e.message)));
  if (s.wait) await page.waitForTimeout(s.wait);
  if (s.shot) await page.screenshot({ path: `${out}/${s.shot}.png` });
}
console.log(logs.filter((l) => !l.includes('[vite]')).slice(-40).join('\n'));
await browser.close();
