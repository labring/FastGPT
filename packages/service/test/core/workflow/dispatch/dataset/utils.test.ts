import { describe, expect, it } from 'vitest';
import { normalizeDatasetSearchInput } from '../../../../../core/workflow/dispatch/dataset/utils';

describe('normalizeDatasetSearchInput', () => {
  it('should split text queries and image urls', () => {
    const result = normalizeDatasetSearchInput([
      ' black high heels ',
      'temp/team-1/search-image.png',
      'chat/team-1/manual.pdf',
      'https://example.com/current.png',
      'data:image/png;base64,abc',
      'dataset/team-1/photo.webp',
      'https://example.com/manual.pdf',
      ''
    ]);

    expect(result.textQueries).toEqual([
      'black high heels',
      'temp/team-1/search-image.png',
      'chat/team-1/manual.pdf',
      'dataset/team-1/photo.webp'
    ]);
    expect(result.imageQueries).toEqual([
      'https://example.com/current.png',
      'data:image/png;base64,abc'
    ]);
  });

  it('should classify image Data URLs and discard other Data URLs', () => {
    const result = normalizeDatasetSearchInput([
      'data:IMAGE/JPEG;base64,/9j/4AAQ',
      'data:IMAGE/JPEG;base64,/9j/4AAQ',
      'data:application/pdf;base64,JVBERi0xLjQK',
      'data:invalid'
    ]);

    expect(result.textQueries).toEqual([]);
    expect(result.imageQueries).toEqual(['data:IMAGE/JPEG;base64,/9j/4AAQ']);
  });

  it('should only classify http image urls by parsed file type', () => {
    const result = normalizeDatasetSearchInput([
      '/api/file/read?filename=current.png',
      '/api/file/read?filename=manual.pdf',
      'https://cdn.example.com/download?filename=current.png',
      'https://cdn.example.com/download?filename=current.png'
    ]);

    expect(result.textQueries).toEqual([
      '/api/file/read?filename=current.png',
      '/api/file/read?filename=manual.pdf'
    ]);
    expect(result.imageQueries).toEqual(['https://cdn.example.com/download?filename=current.png']);
  });

  it('should remove duplicated text queries and images', () => {
    const result = normalizeDatasetSearchInput([
      'same query',
      'same query',
      'https://example.com/a.png',
      'https://example.com/a.png'
    ]);

    expect(result.textQueries).toEqual(['same query']);
    expect(result.imageQueries).toEqual(['https://example.com/a.png']);
  });
});
