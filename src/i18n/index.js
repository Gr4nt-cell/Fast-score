// App languages: English plus the 9 most spoken others. Every Text in the app passes through
// tr(), so screens keep plain English in their code: exact phrases come from the dictionary,
// sentences with numbers or names in them from patterns ("{0} of {1} landed").
import { I18nManager, NativeModules, Platform } from 'react-native';
import T from './translations.json';

export const LANGUAGES = [
  { code: 'system', name: 'System language', native: '' },
  { code: 'en', name: 'English', native: 'English' },
  { code: 'zh', name: 'Chinese', native: '中文（简体）' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'ur', name: 'Urdu', native: 'اردو' },
];
const SUPPORTED = new Set(LANGUAGES.map((l) => l.code).filter((c) => c !== 'system'));

/** The phone's language, if we have it; otherwise English. */
export function deviceLanguage() {
  let tag = '';
  try {
    tag = Intl.DateTimeFormat().resolvedOptions().locale || '';
  } catch {}
  if (!tag && Platform.OS === 'android') tag = (NativeModules.I18nManager && NativeModules.I18nManager.localeIdentifier) || '';
  const code = String(tag).toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.has(code) ? code : 'en';
}

let lang = 'en';
let dict = null;
let patterns = [];
const cache = new Map();

export function setLanguage(choice) {
  const next = !choice || choice === 'system' ? deviceLanguage() : SUPPORTED.has(choice) ? choice : 'en';
  if (next === lang && (dict || next === 'en')) return lang;
  lang = next;
  cache.clear();
  if (lang === 'en' || !T[lang]) {
    dict = null;
    patterns = [];
    return lang;
  }
  dict = T[lang].strings;
  const esc = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  patterns = T.en.patterns
    .map((en, i) => {
      const order = [];
      const src = esc(en).replace(/\{(\d)\}/g, (_, d) => {
        order.push(Number(d));
        return '(.+?)';
      });
      return { re: new RegExp('^' + src + '$'), order, to: T[lang].patterns[i], len: en.length };
    })
    .sort((a, b) => b.len - a.len);
  return lang;
}

export const language = () => lang;
export const isRTL = () => lang === 'ar' || lang === 'ur';

function core(s) {
  if (dict[s] != null) return dict[s];
  for (const p of patterns) {
    const m = s.match(p.re);
    if (!m) continue;
    const vals = {};
    p.order.forEach((d, i) => {
      const v = m[i + 1];
      // a captured word may be a phrase we know ("No football on this day")
      const cap = v.charAt(0).toUpperCase() + v.slice(1);
      vals[d] = dict[v] != null ? dict[v] : dict[cap] != null && v !== cap ? dict[cap].toLowerCase() : v;
    });
    return p.to.replace(/\{(\d)\}/g, (_, d) => (vals[d] != null ? vals[d] : ''));
  }
  return null;
}

/** Translate one piece of UI text (unknown text, e.g. team names, is returned as it is). */
export function tr(s) {
  if (!dict || typeof s !== 'string' || !/[A-Za-z]/.test(s)) return s;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  // keep surrounding spaces / separators ("· 3 events")
  const m = s.match(/^(\s*(?:·\s*)?)(.*?)(\s*)$/s);
  const out = m && m[2] ? (() => {
    const x = core(m[2]);
    return x == null ? s : m[1] + x + m[3];
  })() : s;
  if (cache.size > 3000) cache.clear();
  cache.set(s, out);
  return out;
}

/** Translate the string children of a Text (strings inside arrays too). */
export function trChildren(children) {
  if (!dict) return children;
  if (typeof children === 'string') return tr(children);
  if (Array.isArray(children)) {
    // a sentence split by JSX into pieces ("Top 5 for ", date): try it whole first
    if (children.every((c) => typeof c === 'string' || typeof c === 'number')) {
      const whole = children.join('');
      const t = tr(whole);
      if (t !== whole) return t;
    }
    return children.map((c) => (typeof c === 'string' ? tr(c) : c));
  }
  return children;
}

export const rtlSupported = () => I18nManager.isRTL;
