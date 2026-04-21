import { describe, it, expect } from 'vitest';
import {
  isCSVFile,
  detectImageContentType,
  normalizeFileExtension,
  getAllowedExtensionsFromFileSelectConfig,
  isFileAllowedByFileSelectConfig
} from '@fastgpt/global/common/file/utils';

describe('isCSVFile', () => {
  it('should detect csv extension', () => {
    expect(isCSVFile('data.csv')).toBe(true);
  });

  it('should be case insensitive', () => {
    expect(isCSVFile('DATA.CSV')).toBe(true);
  });

  it('should return false for non-csv extensions', () => {
    expect(isCSVFile('data.csv.txt')).toBe(false);
    expect(isCSVFile('data.txt')).toBe(false);
    expect(isCSVFile('data')).toBe(false);
  });
});

describe('normalizeFileExtension', () => {
  it('should normalize case and leading dot', () => {
    expect(normalizeFileExtension('PNG')).toBe('.png');
    expect(normalizeFileExtension('.JPG')).toBe('.jpg');
  });

  it('should return empty string for empty values', () => {
    expect(normalizeFileExtension('')).toBe('');
    expect(normalizeFileExtension(undefined)).toBe('');
  });
});

describe('getAllowedExtensionsFromFileSelectConfig', () => {
  it('should merge built-in and custom extensions', () => {
    expect(
      getAllowedExtensionsFromFileSelectConfig({
        canSelectFile: true,
        canSelectCustomFileExtension: true,
        customFileExtensionList: ['log', '.TXT']
      })
    ).toEqual(
      expect.arrayContaining([
        '.pdf',
        '.docx',
        '.pptx',
        '.xlsx',
        '.txt',
        '.md',
        '.html',
        '.csv',
        '.log'
      ])
    );
  });

  it('should return empty array when file upload is disabled', () => {
    expect(getAllowedExtensionsFromFileSelectConfig()).toEqual([]);
    expect(getAllowedExtensionsFromFileSelectConfig({})).toEqual([]);
  });
});

describe('isFileAllowedByFileSelectConfig', () => {
  it('should allow clipboard image files when image upload is enabled', () => {
    const file = new File(['a'], 'clipboard', { type: 'image/png' });

    expect(
      isFileAllowedByFileSelectConfig({
        file,
        fileSelectConfig: {
          canSelectImg: true
        }
      })
    ).toBe(true);
  });

  it('should reject clipboard image files when image upload is disabled', () => {
    const file = new File(['a'], 'clipboard', { type: 'image/png' });

    expect(
      isFileAllowedByFileSelectConfig({
        file,
        fileSelectConfig: {
          canSelectFile: true
        }
      })
    ).toBe(false);
  });

  it('should allow document files by extension', () => {
    const file = new File(['a'], 'report.PDF', { type: 'application/pdf' });

    expect(
      isFileAllowedByFileSelectConfig({
        file,
        fileSelectConfig: {
          canSelectFile: true
        }
      })
    ).toBe(true);
  });

  it('should allow custom file extensions', () => {
    const file = new File(['a'], 'trace.LOG', { type: 'text/plain' });

    expect(
      isFileAllowedByFileSelectConfig({
        file,
        fileSelectConfig: {
          canSelectCustomFileExtension: true,
          customFileExtensionList: ['.log']
        }
      })
    ).toBe(true);
  });
});

describe('detectImageContentType', () => {
  it('should return text/plain for empty or short buffer', () => {
    expect(detectImageContentType(Buffer.alloc(0))).toBe('text/plain');
    expect(detectImageContentType(Buffer.alloc(11, 0xff))).toBe('text/plain');
  });

  it('should detect jpeg', () => {
    const buffer = Buffer.from([
      0xff, 0xd8, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    expect(detectImageContentType(buffer)).toBe('image/jpeg');
  });

  it('should detect png', () => {
    const buffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00
    ]);
    expect(detectImageContentType(buffer)).toBe('image/png');
  });

  it('should detect gif', () => {
    const buffer = Buffer.from('GIF89a000000', 'ascii');
    expect(detectImageContentType(buffer)).toBe('image/gif');
  });

  it('should detect webp', () => {
    const buffer = Buffer.from('RIFF0000WEBP0000', 'ascii');
    expect(detectImageContentType(buffer)).toBe('image/webp');
  });

  it('should return text/plain for unknown format', () => {
    const buffer = Buffer.alloc(12, 0x00);
    expect(detectImageContentType(buffer)).toBe('text/plain');
  });

  it('should handle undefined buffer', () => {
    // @ts-expect-error - runtime guard should handle undefined
    expect(detectImageContentType(undefined)).toBe('text/plain');
  });
});
