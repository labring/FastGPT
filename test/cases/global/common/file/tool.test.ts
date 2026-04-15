import { describe, it, expect } from 'vitest';
import {
  formatFileSize,
  detectFileEncoding,
  hasNonAsciiByte,
  hasUtf8Bom,
  isContinuationByte,
  isValidUtf8,
  getDetectSample,
  getUtf8ValidateEnd
} from '@fastgpt/global/common/file/tools';

describe('文件工具函数测试', () => {
  describe('formatFileSize', () => {
    it('should format 0 bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('should format bytes correctly', () => {
      expect(formatFileSize(1)).toBe('1 B');
      expect(formatFileSize(100)).toBe('100 B');
      expect(formatFileSize(1023)).toBe('1023 B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(10240)).toBe('10 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
      expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('should format terabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
      expect(formatFileSize(1.25 * 1024 * 1024 * 1024 * 1024)).toBe('1.25 TB');
    });

    it('should format petabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024 * 1024)).toBe('1 PB');
    });

    it('should round to 2 decimal places', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1234567)).toBe('1.18 MB');
      expect(formatFileSize(1234567890)).toBe('1.15 GB');
    });

    it('should handle very large numbers', () => {
      const result = formatFileSize(9999999999999999);
      expect(result).toMatch(/\d+(\.\d+)?\s+(EB|PB)/);
    });

    it('should handle decimal values', () => {
      expect(formatFileSize(1024.5)).toBe('1 KB');
      expect(formatFileSize(1536.7)).toBe('1.5 KB');
    });
  });

  describe('hasNonAsciiByte', () => {
    it('should return false for pure ascii buffer', () => {
      expect(hasNonAsciiByte(Buffer.from('Hello123', 'ascii'))).toBe(false);
    });

    it('should return false for empty buffer', () => {
      expect(hasNonAsciiByte(Buffer.alloc(0))).toBe(false);
    });

    it('should return true for utf-8 chinese buffer', () => {
      expect(hasNonAsciiByte(Buffer.from('中文', 'utf8'))).toBe(true);
    });

    it('should return true for single byte > 0x7f', () => {
      expect(hasNonAsciiByte(Buffer.from([0x80]))).toBe(true);
      expect(hasNonAsciiByte(Buffer.from([0xff]))).toBe(true);
    });

    it('should return false for boundary byte 0x7f', () => {
      expect(hasNonAsciiByte(Buffer.from([0x7f]))).toBe(false);
    });
  });

  describe('hasUtf8Bom', () => {
    it('should detect BOM at start of buffer', () => {
      const buf = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('hello', 'utf8')
      ] as unknown as Uint8Array[]);
      expect(hasUtf8Bom(buf)).toBe(true);
    });

    it('should return false when buffer is shorter than BOM', () => {
      expect(hasUtf8Bom(Buffer.from([0xef, 0xbb]))).toBe(false);
      expect(hasUtf8Bom(Buffer.alloc(0))).toBe(false);
    });

    it('should return false for buffer without BOM', () => {
      expect(hasUtf8Bom(Buffer.from('hello', 'utf8'))).toBe(false);
    });

    it('should return false for partial BOM match', () => {
      expect(hasUtf8Bom(Buffer.from([0xef, 0xbb, 0xbe]))).toBe(false);
      expect(hasUtf8Bom(Buffer.from([0xef, 0xbc, 0xbf]))).toBe(false);
      expect(hasUtf8Bom(Buffer.from([0xee, 0xbb, 0xbf]))).toBe(false);
    });
  });

  describe('isContinuationByte', () => {
    it('should accept bytes in [0x80, 0xbf]', () => {
      expect(isContinuationByte(0x80)).toBe(true);
      expect(isContinuationByte(0xa0)).toBe(true);
      expect(isContinuationByte(0xbf)).toBe(true);
    });

    it('should reject bytes below 0x80', () => {
      expect(isContinuationByte(0x7f)).toBe(false);
      expect(isContinuationByte(0x00)).toBe(false);
    });

    it('should reject bytes above 0xbf', () => {
      expect(isContinuationByte(0xc0)).toBe(false);
      expect(isContinuationByte(0xff)).toBe(false);
    });
  });

  describe('isValidUtf8', () => {
    it('should accept pure ascii', () => {
      expect(isValidUtf8(Buffer.from('Hello World', 'ascii'))).toBe(true);
    });

    it('should accept empty buffer', () => {
      expect(isValidUtf8(Buffer.alloc(0))).toBe(true);
    });

    it('should accept valid 2-byte sequence (0xc2-0xdf, Latin supplement)', () => {
      // é = 0xc3 0xa9
      expect(isValidUtf8(Buffer.from('café', 'utf8'))).toBe(true);
      expect(isValidUtf8(Buffer.from([0xc2, 0x80]))).toBe(true);
      expect(isValidUtf8(Buffer.from([0xdf, 0xbf]))).toBe(true);
    });

    it('should reject 2-byte sequence with invalid continuation', () => {
      expect(isValidUtf8(Buffer.from([0xc3, 0x00]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xc3, 0xc0]))).toBe(false);
    });

    it('should reject truncated 2-byte sequence', () => {
      expect(isValidUtf8(Buffer.from([0xc3]))).toBe(false);
    });

    it('should accept valid 0xe0 3-byte sequence (U+0800 boundary)', () => {
      expect(isValidUtf8(Buffer.from([0xe0, 0xa0, 0x80]))).toBe(true);
      expect(isValidUtf8(Buffer.from([0xe0, 0xbf, 0xbf]))).toBe(true);
    });

    it('should reject 0xe0 with overlong encoding (byte[1] < 0xa0)', () => {
      expect(isValidUtf8(Buffer.from([0xe0, 0x80, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xe0, 0x9f, 0x80]))).toBe(false);
    });

    it('should reject 0xe0 with byte[1] > 0xbf', () => {
      expect(isValidUtf8(Buffer.from([0xe0, 0xc0, 0x80]))).toBe(false);
    });

    it('should reject 0xe0 with invalid byte[2]', () => {
      expect(isValidUtf8(Buffer.from([0xe0, 0xa0, 0x00]))).toBe(false);
    });

    it('should reject truncated 0xe0 sequence', () => {
      expect(isValidUtf8(Buffer.from([0xe0, 0xa0]))).toBe(false);
    });

    it('should accept valid 0xe1-0xec sequence (CJK)', () => {
      // 你 = 0xe4 0xbd 0xa0
      expect(isValidUtf8(Buffer.from('你好世界', 'utf8'))).toBe(true);
    });

    it('should reject 0xe1-0xec with invalid continuation', () => {
      expect(isValidUtf8(Buffer.from([0xe4, 0x00, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xe4, 0x80, 0xc0]))).toBe(false);
    });

    it('should reject truncated 0xe1-0xec sequence', () => {
      expect(isValidUtf8(Buffer.from([0xe4, 0x80]))).toBe(false);
    });

    it('should accept valid 0xed sequence (U+D000 range)', () => {
      // U+D000 = 0xed 0x80 0x80
      expect(isValidUtf8(Buffer.from([0xed, 0x80, 0x80]))).toBe(true);
      expect(isValidUtf8(Buffer.from([0xed, 0x9f, 0xbf]))).toBe(true);
    });

    it('should reject 0xed surrogate range (byte[1] > 0x9f)', () => {
      // 0xed 0xa0+ would encode surrogate halves, invalid in UTF-8
      expect(isValidUtf8(Buffer.from([0xed, 0xa0, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xed, 0xbf, 0xbf]))).toBe(false);
    });

    it('should reject 0xed with byte[1] < 0x80', () => {
      expect(isValidUtf8(Buffer.from([0xed, 0x7f, 0x80]))).toBe(false);
    });

    it('should reject 0xed with invalid byte[2]', () => {
      expect(isValidUtf8(Buffer.from([0xed, 0x80, 0x00]))).toBe(false);
    });

    it('should accept valid 0xee-0xef sequence (PUA)', () => {
      // U+E000 = 0xee 0x80 0x80
      expect(isValidUtf8(Buffer.from([0xee, 0x80, 0x80]))).toBe(true);
      expect(isValidUtf8(Buffer.from([0xef, 0xbf, 0xbd]))).toBe(true); // replacement char
    });

    it('should reject 0xee-0xef with invalid continuation', () => {
      expect(isValidUtf8(Buffer.from([0xee, 0x00, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xef, 0x80, 0xc0]))).toBe(false);
    });

    it('should accept valid 0xf0 4-byte sequence (U+10000 boundary)', () => {
      // U+10000 = 0xf0 0x90 0x80 0x80
      expect(isValidUtf8(Buffer.from([0xf0, 0x90, 0x80, 0x80]))).toBe(true);
      // 😀 = U+1F600 = 0xf0 0x9f 0x98 0x80
      expect(isValidUtf8(Buffer.from('😀', 'utf8'))).toBe(true);
    });

    it('should reject 0xf0 with overlong encoding (byte[1] < 0x90)', () => {
      expect(isValidUtf8(Buffer.from([0xf0, 0x80, 0x80, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xf0, 0x8f, 0x80, 0x80]))).toBe(false);
    });

    it('should reject 0xf0 with byte[1] > 0xbf', () => {
      expect(isValidUtf8(Buffer.from([0xf0, 0xc0, 0x80, 0x80]))).toBe(false);
    });

    it('should reject 0xf0 with invalid byte[2] or byte[3]', () => {
      expect(isValidUtf8(Buffer.from([0xf0, 0x90, 0x00, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xf0, 0x90, 0x80, 0x00]))).toBe(false);
    });

    it('should reject truncated 0xf0 sequence', () => {
      expect(isValidUtf8(Buffer.from([0xf0, 0x90, 0x80]))).toBe(false);
    });

    it('should accept valid 0xf1-0xf3 4-byte sequence', () => {
      // U+50000 = 0xf1 0x90 0x80 0x80
      expect(isValidUtf8(Buffer.from([0xf1, 0x90, 0x80, 0x80]))).toBe(true);
      expect(isValidUtf8(Buffer.from([0xf3, 0xbf, 0xbf, 0xbf]))).toBe(true);
    });

    it('should reject 0xf1-0xf3 with invalid continuation', () => {
      expect(isValidUtf8(Buffer.from([0xf1, 0x00, 0x80, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xf2, 0x80, 0xc0, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xf3, 0x80, 0x80, 0xc0]))).toBe(false);
    });

    it('should reject truncated 0xf1-0xf3 sequence', () => {
      expect(isValidUtf8(Buffer.from([0xf1, 0x80, 0x80]))).toBe(false);
    });

    it('should accept valid 0xf4 sequence (U+100000 range)', () => {
      expect(isValidUtf8(Buffer.from([0xf4, 0x80, 0x80, 0x80]))).toBe(true);
      expect(isValidUtf8(Buffer.from([0xf4, 0x8f, 0xbf, 0xbf]))).toBe(true);
    });

    it('should reject 0xf4 with byte[1] > 0x8f (beyond U+10FFFF)', () => {
      expect(isValidUtf8(Buffer.from([0xf4, 0x90, 0x80, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xf4, 0xbf, 0xbf, 0xbf]))).toBe(false);
    });

    it('should reject 0xf4 with byte[1] < 0x80', () => {
      expect(isValidUtf8(Buffer.from([0xf4, 0x7f, 0x80, 0x80]))).toBe(false);
    });

    it('should reject 0xf4 with invalid continuation bytes', () => {
      expect(isValidUtf8(Buffer.from([0xf4, 0x80, 0x00, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xf4, 0x80, 0x80, 0x00]))).toBe(false);
    });

    it('should reject truncated 0xf4 sequence', () => {
      expect(isValidUtf8(Buffer.from([0xf4, 0x80, 0x80]))).toBe(false);
    });

    it('should reject lone continuation byte', () => {
      expect(isValidUtf8(Buffer.from([0x48, 0x80, 0x48]))).toBe(false);
    });

    it('should reject 0xc0/0xc1 overlong lead bytes', () => {
      expect(isValidUtf8(Buffer.from([0xc0, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xc1, 0x80]))).toBe(false);
    });

    it('should reject 0xf5-0xff lead bytes', () => {
      expect(isValidUtf8(Buffer.from([0xf5, 0x80, 0x80, 0x80]))).toBe(false);
      expect(isValidUtf8(Buffer.from([0xff]))).toBe(false);
    });

    it('should reject Windows-1252 smart quote bytes', () => {
      expect(isValidUtf8(Buffer.from([0x93, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x94]))).toBe(false);
    });

    it('should respect custom end parameter', () => {
      // bytes after end are ignored
      const buf = Buffer.from([0x48, 0x65, 0xff, 0xff]);
      expect(isValidUtf8(buf, 2)).toBe(true);
      expect(isValidUtf8(buf, 4)).toBe(false);
    });

    it('should treat i+1 == end inside 2-byte as invalid', () => {
      // 0xc3 needs continuation byte within end
      const buf = Buffer.from([0xc3, 0xa9]);
      expect(isValidUtf8(buf, 1)).toBe(false);
    });
  });

  describe('getDetectSample', () => {
    it('should return original buffer when <= 3KB', () => {
      const buf = Buffer.alloc(3072, 0x41);
      expect(getDetectSample(buf)).toBe(buf);
    });

    it('should return head+middle+tail (3KB) for large buffer', () => {
      const buf = Buffer.alloc(10000, 0x41);
      const sample = getDetectSample(buf);
      expect(sample.length).toBe(3 * 1024);
    });

    it('should sample head, middle and tail regions', () => {
      const head = Buffer.alloc(1024, 0x41); // 'A'
      const body = Buffer.alloc(8000, 0x42); // 'B'
      const tail = Buffer.alloc(1024, 0x43); // 'C'
      const buf = Buffer.concat([head, body, tail] as unknown as Uint8Array[]);
      const sample = getDetectSample(buf);

      expect(sample[0]).toBe(0x41); // from head
      expect(sample[sample.length - 1]).toBe(0x43); // from tail
    });
  });

  describe('getUtf8ValidateEnd', () => {
    it('should return buffer.length when <= 1MB', () => {
      const buf = Buffer.alloc(1024 * 1024, 0x41);
      expect(getUtf8ValidateEnd(buf)).toBe(buf.length);
    });

    it('should return 0-byte for empty buffer', () => {
      expect(getUtf8ValidateEnd(Buffer.alloc(0))).toBe(0);
    });

    it('should find safe boundary at ascii byte for >1MB buffer', () => {
      // Fill with 'A' (0x41); boundary should be at exactly MAX_UTF8_VALIDATE_SIZE
      const buf = Buffer.alloc(1024 * 1024 + 100, 0x41);
      const end = getUtf8ValidateEnd(buf);
      expect(end).toBe(1024 * 1024);
    });

    it('should find safe boundary at utf-8 lead byte when preceded by continuation bytes', () => {
      // Fill with continuation bytes at the boundary, place lead byte 2 positions back
      const buf = Buffer.alloc(1024 * 1024 + 100, 0x80);
      buf[1024 * 1024 - 2] = 0xc2; // lead byte for 2-byte sequence
      const end = getUtf8ValidateEnd(buf);
      expect(end).toBe(1024 * 1024 - 2);
    });

    it('should fall back to MAX size when no safe boundary in last 4 bytes', () => {
      // All 4 candidate positions are continuation bytes (0x80-0xbf)
      const buf = Buffer.alloc(1024 * 1024 + 100, 0x80);
      expect(getUtf8ValidateEnd(buf)).toBe(1024 * 1024);
    });
  });

  describe('detectFileEncoding', () => {
    it('should detect UTF-8 with BOM', () => {
      const content = Buffer.from('Hello 世界', 'utf8');
      const bomBuffer = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        content
      ] as unknown as Uint8Array[]);
      expect(detectFileEncoding(bomBuffer)).toBe('utf-8');
    });

    it('should detect UTF-8 encoding', () => {
      const buffer = Buffer.from('Hello World 你好世界', 'utf8');
      expect(detectFileEncoding(buffer)).toBe('utf-8');
    });

    it('should handle ASCII buffer', () => {
      const buffer = Buffer.from('Hello World 123', 'ascii');
      expect(['ascii', 'utf-8']).toContain(detectFileEncoding(buffer));
    });

    it('should handle empty buffer', () => {
      const encoding = detectFileEncoding(Buffer.alloc(0));
      expect([undefined, 'ascii', 'utf-8']).toContain(encoding);
    });

    it('should not treat invalid utf-8 sequence as utf-8', () => {
      const invalid = Buffer.from([0x93, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x94]);
      expect(detectFileEncoding(invalid)).not.toBe('utf-8');
    });

    it('should detect utf-8 for english prefix and chinese body', () => {
      const longPrefix = 'A'.repeat(2048);
      const mixed = `${longPrefix}\n\n这里是中文正文。`;
      expect(detectFileEncoding(Buffer.from(mixed, 'utf8'))).toBe('utf-8');
    });

    it('should detect utf-8 for large (>1MB) buffer via sampled validation', () => {
      const chunk = 'Hello 你好世界 😀\n';
      const buf = Buffer.from(chunk.repeat(100000), 'utf8');
      expect(buf.length).toBeGreaterThan(1024 * 1024);
      expect(detectFileEncoding(buf)).toBe('utf-8');
    });

    it('should route large non-utf8 buffer through jschardet sampling', () => {
      const buf = Buffer.alloc(5000, 0x93);
      expect(detectFileEncoding(buf)).not.toBe('utf-8');
    });

    it('should detect GBK encoded text', () => {
      // 你好 in GBK
      const buf = Buffer.from([0xc4, 0xe3, 0xba, 0xc3]);
      const encoding = detectFileEncoding(buf);
      expect(typeof encoding).toBe('string');
    });
  });
});
