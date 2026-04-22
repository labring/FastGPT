import { describe, it, expect } from 'vitest';
import { getFileIcon } from '@fastgpt/global/common/file/icon';

describe('getFileIcon', () => {
  it('should match common document types', () => {
    const cases = [
      ['report.pdf', 'file/fill/pdf'],
      ['slides.ppt', 'file/fill/ppt'],
      ['sheet.xlsx', 'file/fill/xlsx'],
      ['data.csv', 'file/fill/csv'],
      ['doc.doc', 'file/fill/doc'],
      ['doc.docs', 'file/fill/doc'],
      ['notes.txt', 'file/fill/txt'],
      ['readme.md', 'file/fill/markdown'],
      ['index.html', 'file/fill/html']
    ] as const;

    cases.forEach(([name, expected]) => {
      expect(getFileIcon(name)).toBe(expected);
    });
  });

  it('should match media types', () => {
    const cases = [
      ['photo.jpeg', 'image'],
      ['photo.JPG', 'image'],
      ['sound.mp3', 'file/fill/audio'],
      ['movie.mp4', 'file/fill/video']
    ] as const;

    cases.forEach(([name, expected]) => {
      expect(getFileIcon(name)).toBe(expected);
    });
  });

  it('should be case insensitive', () => {
    expect(getFileIcon('REPORT.PDF')).toBe('file/fill/pdf');
  });

  it('should return default icon when no match', () => {
    expect(getFileIcon('archive.zip')).toBe('file/fill/file');
  });

  it('should return custom default icon when provided', () => {
    expect(getFileIcon('archive.zip', 'custom/default')).toBe('custom/default');
  });

  it('should handle empty filename', () => {
    expect(getFileIcon('')).toBe('file/fill/file');
  });
});
