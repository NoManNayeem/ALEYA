import type { StringTable } from '@aleya/content-schema';
import type { Locale } from './settings';

/** Externalized string lookup with fallback to English and visible missing-key markers in dev. */
export class Localizer {
  locale: Locale = 'en';
  constructor(private tables: Record<Locale, StringTable>) {}

  t(key: string, vars?: Record<string, string | number>, locale: Locale = this.locale): string {
    let s = this.tables[locale]?.[key] ?? this.tables.en[key];
    if (s === undefined) return `⟦${key}⟧`;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  }

  has(key: string, locale: Locale = this.locale): boolean {
    return this.tables[locale]?.[key] !== undefined;
  }

  /** Convert western digits to Bangla digits for bn locale display. */
  num(n: number | string, locale: Locale = this.locale): string {
    const s = String(n);
    if (locale !== 'bn') return s;
    return s.replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
  }
}
