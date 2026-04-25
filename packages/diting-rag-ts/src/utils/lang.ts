// src/utils/lang.ts
// Language detection utilities

import { eld } from 'eld/small';

// CJK character ranges
const CJK_RANGE = /[一-鿿㐀-䶿가-힯]/; // Chinese + Hangul
const HIRAGANA_KATAKANA = /[぀-ヿ]/; // Hiragana + Katakana
const HANGUL_RANGE = /[가-힯]/;

/**
 * Detect language from text.
 *
 * CJK character range analysis for Asian languages (reliable on short text),
 * eld (Efficient Language Detector) for non-CJK text.
 *
 * Returns ISO 639-1 code (e.g. 'zh', 'en', 'ja', 'ko', 'fr').
 */
export function detectLang(text: string): string {
  if (!text?.trim()) return 'en';
  // 日文假名优先于中文（中文文本不会包含假名，但日文会包含汉字）
  if (HIRAGANA_KATAKANA.test(text)) return 'ja';
  if (HANGUL_RANGE.test(text)) return 'ko';
  if (CJK_RANGE.test(text)) return 'zh';
  const result = eld.detect(text);
  if (!result.isReliable()) return 'en';
  return result.language;
}
