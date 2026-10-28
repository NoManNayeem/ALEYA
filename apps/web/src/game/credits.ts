import type { CreditsData } from '@aleya/ui';
import assetCsv from '../../../../docs/ASSET_LICENSES.csv?raw';

type T = (key: string) => string;

export function creditsData(t: T, ending: 'none' | 'A' | 'B'): CreditsData {
  return {
    epilogue: ending === 'A' ? t('credits.epilogue.A') : ending === 'B' ? t('credits.epilogue.B') : '',
    sections: [
      { title: t('credits.story'), lines: [t('credits.story.body')] },
      { title: t('credits.cast'), lines: [t('credits.cast.body')] },
      { title: t('credits.engineering'), lines: [t('credits.engineering.body')] },
      { title: t('credits.art'), lines: [t('credits.art.body')] },
      { title: t('credits.audio'), lines: [t('credits.audio.body')] },
      { title: t('credits.fonts'), lines: ['Noto Sans · Noto Sans Bengali', 'SIL Open Font License 1.1 · Google / Noto project'] },
      { title: t('credits.software'), lines: ['PlayCanvas Engine · MIT License', 'Zod · MIT License', 'Vite · MIT License (build tool)', 'TypeScript · Apache-2.0 (build tool)'] },
      { title: t('credits.dedication'), lines: [t('credits.dedication.body')] },
      { title: '', lines: [t('credits.notice')] },
    ],
  };
}

export function licenseRows(): { asset: string; source: string; license: string; credit: string }[] {
  const [header, ...rows] = assetCsv.trim().split(/\r?\n/);
  const cols = header.split(',');
  const idx = (n: string) => cols.indexOf(n);
  return rows
    .map((r) => parseCsvLine(r))
    .filter((c) => c[idx('approval')] === 'approved')
    .map((c) => ({ asset: c[idx('original_title')], source: c[idx('creator')], license: c[idx('license')], credit: c[idx('attribution')] }));
}

export function softwareNotices(): { name: string; license: string; url: string }[] {
  return [
    { name: 'PlayCanvas Engine', license: 'MIT', url: 'https://github.com/playcanvas/engine' },
    { name: 'Zod', license: 'MIT', url: 'https://github.com/colinhacks/zod' },
    { name: 'Noto Sans / Noto Sans Bengali (@fontsource)', license: 'OFL-1.1', url: 'https://github.com/notofonts/bengali' },
  ];
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
