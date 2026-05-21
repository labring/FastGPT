import { describe, expect, it } from 'vitest';
import { BoundedOutputBuffer } from '@/utils/outputBuffer';

describe('BoundedOutputBuffer', () => {
  it('retains all output below the limit and reports not truncated', () => {
    const buf = new BoundedOutputBuffer(100);
    buf.append('hello ');
    buf.append('world');
    expect(buf.toString()).toBe('hello world');
    expect(buf.truncated).toBe(false);
    expect(buf.totalBytes).toBe(Buffer.byteLength('hello world', 'utf8'));
  });

  it('drops oldest chunks when exceeding the limit', () => {
    const buf = new BoundedOutputBuffer(10);
    buf.append('aaaaa'); // 5 bytes
    buf.append('bbbbb'); // 10 bytes cumulative
    buf.append('ccccc'); // 15 bytes → drop oldest "aaaaa"
    expect(buf.toString()).toBe('bbbbbccccc');
    expect(buf.truncated).toBe(true);
    expect(buf.totalBytes).toBe(15);
  });

  it('truncates the remaining chunk when a single append exceeds the limit', () => {
    const buf = new BoundedOutputBuffer(5);
    buf.append('0123456789'); // 10 bytes, needs to slice tail of length 5
    expect(buf.toString()).toBe('56789');
    expect(buf.truncated).toBe(true);
    expect(buf.totalBytes).toBe(10);
  });

  it('counts multi-byte UTF-8 bytes correctly', () => {
    const buf = new BoundedOutputBuffer(6);
    // "中" is 3 bytes in UTF-8
    buf.append('中文');
    expect(buf.toString()).toBe('中文');
    expect(buf.truncated).toBe(false);

    buf.append('中'); // now 9 bytes → must drop
    expect(buf.truncated).toBe(true);
    expect(Buffer.byteLength(buf.toString(), 'utf8')).toBeLessThanOrEqual(6);
  });

  it('ignores empty appends', () => {
    const buf = new BoundedOutputBuffer(10);
    buf.append('');
    expect(buf.toString()).toBe('');
    expect(buf.truncated).toBe(false);
    expect(buf.totalBytes).toBe(0);
  });

  it('throws for non-positive maxBytes', () => {
    expect(() => new BoundedOutputBuffer(0)).toThrow();
    expect(() => new BoundedOutputBuffer(-1)).toThrow();
  });

  describe('separator support', () => {
    it('inserts separator between consecutive appends', () => {
      const buf = new BoundedOutputBuffer(100, '\n');
      buf.append('line1');
      buf.append('line2');
      buf.append('line3');
      expect(buf.toString()).toBe('line1\nline2\nline3');
    });

    it('does not prepend separator before the first append', () => {
      const buf = new BoundedOutputBuffer(100, '\n');
      buf.append('only');
      expect(buf.toString()).toBe('only');
    });

    it('counts separator bytes toward the limit', () => {
      // 'a' + '\n' + 'b' = 3 bytes, limit is 3 → fits exactly
      const buf = new BoundedOutputBuffer(3, '\n');
      buf.append('a');
      buf.append('b');
      expect(buf.toString()).toBe('a\nb');
      expect(buf.truncated).toBe(false);

      // one more append overflows — keeps tail
      buf.append('c');
      expect(buf.truncated).toBe(true);
      expect(buf.toString()).toBe('b\nc');
    });

    it('skips separator after empty appends', () => {
      const buf = new BoundedOutputBuffer(100, '\n');
      buf.append('a');
      buf.append('');
      buf.append('b');
      expect(buf.toString()).toBe('a\nb');
    });

    it('does not produce leading separator after truncation', () => {
      // When the original first chunk is fully dropped, the new first chunk's
      // separator prefix must be stripped so output doesn't start with '\n'.
      const buf = new BoundedOutputBuffer(4, '\n');
      buf.append('a'); // 1 byte
      buf.append('b'); // '\nb' = 2 bytes, total = 3
      buf.append('c'); // '\nc' = 2 bytes, total = 5 > 4
      // 'a' is dropped (5-1=4 >= 4), leaving ['\nb', '\nc'].
      // '\nb' starts with separator → stripped to 'b'.
      expect(buf.toString()).toBe('b\nc');
      expect(buf.truncated).toBe(true);
    });

    it('pre-trims oversized single chunk to avoid transient memory spike', () => {
      const buf = new BoundedOutputBuffer(5, '\n');
      buf.append('first'); // 5 bytes, at limit
      buf.append('0123456789'); // sep + text = 11 bytes ≫ 5 → fast path, text trimmed
      expect(buf.toString()).toBe('56789');
      expect(buf.truncated).toBe(true);

      // Next append should still get a separator (chunks is non-empty).
      buf.append('z');
      expect(buf.toString()).toBe('789\nz');
    });

    it('fast-path keeps full text when only separator causes overflow', () => {
      // text (5 bytes) fits in maxBytes, but text + separator (6) does not
      const buf = new BoundedOutputBuffer(5, '\n');
      buf.append('hi'); // 2 bytes
      buf.append('world'); // sep + text = 6 > 5 → fast path, text kept whole
      expect(buf.toString()).toBe('world');
      expect(buf.truncated).toBe(true);
    });
  });
});
