import { describe, expect, it } from 'vitest';
import {
  customNanoid,
  formatNumberWithUnit,
  getNanoid,
  hashStr,
  replaceRegChars,
  replaceSensitiveText,
  replaceVariable,
  simpleText,
  sliceJsonStr,
  sliceStrStartEnd,
  strIsLink,
  valToStr
} from '@fastgpt/global/common/string/tools';

describe('string tools', () => {
  it('should validate links', () => {
    expect(strIsLink('http://example.com')).toBe(true);
    expect(strIsLink('https://example.com/path?x=1')).toBe(true);
    expect(strIsLink('www.example.com')).toBe(true);
    expect(strIsLink('/assets/logo.png')).toBe(true);
    expect(strIsLink('example.com')).toBe(false);
    expect(strIsLink('ftp://example.com')).toBe(false);
    expect(strIsLink('')).toBe(false);
  });

  it('should hash strings with sha256', () => {
    expect(hashStr('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('should normalize text formatting', () => {
    const input = '  你 好 \r\n\r\n\r\nfoo\x00bar  ';
    expect(simpleText(input)).toBe('你 好 \n\nfoo bar');
    expect(simpleText('a   b')).toBe('a   b');
  });

  it('should convert values to strings', () => {
    expect(valToStr(undefined)).toBe('');
    expect(valToStr(null)).toBe('null');
    expect(valToStr({ a: 1 })).toBe('{"a":1}');
    expect(valToStr(123)).toBe('123');
  });

  it('should replace variables with recursion and safeguards', () => {
    expect(replaceVariable('Hello {{name}}', { name: 'Ada' })).toBe('Hello Ada');
    expect(
      replaceVariable('Hello {{name}}', {
        name: '{{first}} {{last}}',
        first: 'Ada',
        last: 'Lovelace'
      })
    ).toBe('Hello Ada Lovelace');
    expect(replaceVariable('Hello {{name}}', { name: undefined })).toBe('Hello ');
    expect(replaceVariable('Hello {{name}}', { name: '{{name}}' })).toBe('Hello {{name}}');
    expect(replaceVariable(123 as any, { name: 'Ada' })).toBe(123);
  });

  it('should replace sensitive text', () => {
    expect(replaceSensitiveText('Visit https://example.com/path?x=1')).toBe('Visit https://xxx');
    expect(replaceSensitiveText('token ns-abc-123 and ns-xyz')).toBe('token xxx and xxx');
  });

  it('should generate nanoid with lowercase prefix', () => {
    const id = getNanoid(12);
    expect(id).toHaveLength(12);
    expect(/^[a-z][a-zA-Z0-9]{11}$/.test(id)).toBe(true);

    const single = getNanoid(1);
    expect(single).toHaveLength(1);
    expect(/^[a-z]$/.test(single)).toBe(true);
  });

  it('should generate custom nanoid', () => {
    const id = customNanoid('ab', 6);
    expect(id).toHaveLength(6);
    expect(/^[ab]{6}$/.test(id)).toBe(true);
  });

  it('should escape regex special characters', () => {
    const text = 'a+b*c?^$()[]{}|\\.';
    const escaped = replaceRegChars(text);
    const reg = new RegExp(escaped);
    expect(reg.test(text)).toBe(true);
  });

  it('should slice json from mixed text', () => {
    expect(sliceJsonStr('prefix {"a":1} suffix')).toBe('{"a":1}');
    expect(sliceJsonStr('  [1,2,3] trailing')).toBe('[1,2,3]');
    expect(sliceJsonStr('no json here')).toBe('no json here');
    expect(sliceJsonStr('prefix {"a":1')).toBe('prefix {"a":1');
  });

  it('should slice string with start and end', () => {
    expect(sliceStrStartEnd('abc', 2, 2)).toBe('abc');
    expect(sliceStrStartEnd(null, 2, 2)).toBe('');
    expect(sliceStrStartEnd('abcdefghijklmnopqrstuvwxyz', 5, 4)).toBe(
      'abcde\n\n...[hide 17 chars]...\n\nwxyz'
    );
  });

  it('should format numbers with units', () => {
    expect(formatNumberWithUnit(0)).toBe('0');
    expect(formatNumberWithUnit(Number.NaN)).toBe('-');
    expect(formatNumberWithUnit(123456, 'zh-CN')).toBe('12.35万');
    expect(formatNumberWithUnit(-200000, 'zh-CN')).toBe('-20万');
    expect(formatNumberWithUnit(1200, 'en')).toBe('1.2K');
    expect(formatNumberWithUnit(1250000, 'en')).toBe('1.25M');
    expect(formatNumberWithUnit(999, 'en')).toBe('999');
  });
});
