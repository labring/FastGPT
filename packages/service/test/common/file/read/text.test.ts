import { describe, expect, it } from 'vitest';
import { isLikelyTextBuffer } from '@fastgpt/service/common/file/read/text';

const utf16le = (text: string, bom = false) =>
  Buffer.concat([...(bom ? [Buffer.from([0xff, 0xfe])] : []), Buffer.from(text, 'utf16le')]);
const utf16be = (text: string, bom = false) => {
  const body = Buffer.from(text, 'utf16le');
  body.swap16();
  return Buffer.concat([...(bom ? [Buffer.from([0xfe, 0xff])] : []), body]);
};

describe('isLikelyTextBuffer', () => {
  it('treats empty buffers as text', () => {
    expect(isLikelyTextBuffer(Buffer.alloc(0))).toBe(true);
  });

  it('accepts utf-8 text', () => {
    expect(isLikelyTextBuffer(Buffer.from('<?xml version="1.0"?>\n<svg/>', 'utf8'))).toBe(true);
  });

  it('rejects binary content with embedded nul bytes', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    expect(isLikelyTextBuffer(png)).toBe(false);
  });

  it('rejects all-nul buffers', () => {
    expect(isLikelyTextBuffer(Buffer.alloc(64))).toBe(false);
  });

  it.each([
    ['utf-16le bom', utf16le('<?xml version="1.0" encoding="UTF-16"?>\n<svg/>', true)],
    ['utf-16be bom', utf16be('<?xml version="1.0" encoding="UTF-16"?>\n<svg/>', true)],
    ['utf-16le without bom', utf16le('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['utf-16be without bom', utf16be('<svg xmlns="http://www.w3.org/2000/svg"/>')]
  ])('accepts %s', (_label, buffer) => {
    expect(isLikelyTextBuffer(buffer)).toBe(true);
  });

  it('still rejects utf-16 encoded control characters', () => {
    expect(isLikelyTextBuffer(utf16le(String.fromCharCode(1).repeat(32), true))).toBe(false);
  });

  it('does not throw on a truncated utf-16 buffer', () => {
    const truncated = utf16le('<svg/>', true).subarray(0, 7);
    expect(() => isLikelyTextBuffer(truncated)).not.toThrow();
  });
});
