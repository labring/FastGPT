// test/unit/lang.test.ts
import { describe, it, expect } from 'vitest';
import { detectLang } from '../../src/utils/lang';

describe('detectLang', () => {
  it('returns zh for pure Chinese text', () => {
    expect(detectLang('今天天气很好')).toBe('zh');
    expect(detectLang('请帮我查询一下订单状态')).toBe('zh');
  });

  it('returns en for pure English text', () => {
    // franc on short English text may misdetect, but our CJK gate
    // ensures non-CJK short text defaults to franc's best guess.
    // Long English text is reliably detected.
    const result = detectLang(
      'What is the weather today? I would like to know the forecast for this week.'
    );
    expect(result).toBe('en');
  });

  it('returns zh for mixed Chinese-English text (CJK present)', () => {
    expect(detectLang('reset-password.txt 是什么文件')).toBe('zh');
    expect(detectLang('API接口文档')).toBe('zh');
  });

  it('returns ja for Japanese text (hiragana present)', () => {
    expect(detectLang('今日は良い天気です')).toBe('ja');
    expect(detectLang('ドキュメントを検索する')).toBe('ja');
  });

  it('returns ko for Korean text (hangul present)', () => {
    expect(detectLang('안녕하세요')).toBe('ko');
  });

  it('returns en for empty or whitespace-only string', () => {
    expect(detectLang('')).toBe('en');
    expect(detectLang('   ')).toBe('en');
  });

  it('handles text with special characters (no CJK)', () => {
    // Pure ASCII — franc will attempt detection
    // For short ASCII, franc is unreliable; we just check it does not throw
    const result = detectLang('HTTP/1.1 200 OK');
    expect(typeof result).toBe('string');
  });

  it('returns en for very short text without CJK', () => {
    // eld returns isReliable()=false for very short text → fallback to 'en'
    expect(detectLang('OK')).toBe('en');
    expect(detectLang('a')).toBe('en');
  });

  it('returns ISO 639-1 code for long French text', () => {
    const result = detectLang(
      "Bonjour, je voudrais savoir comment configurer le système d'authentification."
    );
    expect(result).toBe('fr');
  });
});
