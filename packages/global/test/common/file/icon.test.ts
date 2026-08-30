import { describe, it, expect } from 'vitest';
import { getFileIcon } from '@fastgpt/global/common/file/icon';

describe('getFileIcon', () => {
  it('should match common document types', () => {
    const cases = [
      ['report.pdf', 'file/fill/pdf'],
      ['slides.pptx', 'file/fill/ppt'],
      ['sheet.xlsx', 'file/fill/xlsx'],
      ['data.csv', 'file/fill/csv'],
      ['doc.docx', 'file/fill/doc'],
      ['doc.docs', 'file/fill/doc'],
      ['notes.txt', 'file/fill/txt'],
      ['readme.md', 'file/fill/markdown'],
      ['index.html', 'file/fill/html']
    ] as const;

    cases.forEach(([name, expected]) => {
      expect(getFileIcon(name)).toBe(expected);
    });
  });

  it('should match all AnyDoc document families', () => {
    const cases = [
      ['document.doc', 'file/fill/doc'],
      ['document.wps', 'file/fill/doc'],
      ['document.docm', 'file/fill/doc'],
      ['document.odt', 'file/fill/doc'],
      ['document.rtf', 'file/fill/doc'],
      ['slides.ppt', 'file/fill/ppt'],
      ['slides.pps', 'file/fill/ppt'],
      ['slides.pot', 'file/fill/ppt'],
      ['slides.pptm', 'file/fill/ppt'],
      ['slides.ppsx', 'file/fill/ppt'],
      ['slides.ppsm', 'file/fill/ppt'],
      ['slides.odp', 'file/fill/ppt'],
      ['sheet.xls', 'file/fill/xlsx'],
      ['sheet.xlsm', 'file/fill/xlsx'],
      ['sheet.xlsb', 'file/fill/xlsx'],
      ['sheet.ods', 'file/fill/xlsx'],
      ['book.epub', 'file/fill/epub']
    ] as const;

    cases.forEach(([name, expected]) => {
      expect(getFileIcon(name)).toBe(expected);
    });
  });

  it('should only match the final filename extension', () => {
    expect(getFileIcon('新建 DOCX 文档 (2).md')).toBe('file/fill/markdown');
    expect(getFileIcon('doc.reference/final.md')).toBe('file/fill/markdown');
    expect(getFileIcon('document.docx.backup')).toBe('file/fill/file');
  });

  it('should ignore URL query and hash when matching the extension', () => {
    expect(getFileIcon('https://files.example.com/report.PDF?token=file.md#preview')).toBe(
      'file/fill/pdf'
    );
    expect(getFileIcon('https://files.example.com/%E6%96%87%E6%A1%A3.md?download=1')).toBe(
      'file/fill/markdown'
    );
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
