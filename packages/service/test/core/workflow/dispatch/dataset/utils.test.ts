import { describe, expect, it } from 'vitest';
import { normalizeDatasetSearchInput as normalizeDatasetSearchInputWithoutContext } from '../../../../../core/workflow/dispatch/dataset/utils';
import { runInTestWorkflowContext } from '../context/fixtures';

const normalizeDatasetSearchInput: typeof normalizeDatasetSearchInputWithoutContext = (inputs) =>
  runInTestWorkflowContext(() => normalizeDatasetSearchInputWithoutContext(inputs));

describe('normalizeDatasetSearchInput', () => {
  it('should split text queries and image urls', async () => {
    const result = await normalizeDatasetSearchInput([
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
    expect(result.imageQueries).toEqual(['https://example.com/current.png']);
  });

  it('运行 Context 默认拒绝 Data URL，不将它们降级为文本查询', async () => {
    const result = await normalizeDatasetSearchInput([
      'data:IMAGE/JPEG;base64,/9j/4AAQ',
      'data:IMAGE/JPEG;base64,/9j/4AAQ',
      'data:application/pdf;base64,JVBERi0xLjQK',
      'data:invalid'
    ]);

    expect(result.textQueries).toEqual([]);
    expect(result.imageQueries).toEqual([]);
  });

  it('should only classify http image urls by parsed file type', async () => {
    const result = await normalizeDatasetSearchInput([
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

  it('should remove duplicated text queries and images', async () => {
    const result = await normalizeDatasetSearchInput([
      'same query',
      'same query',
      'https://example.com/a.png',
      'https://example.com/a.png'
    ]);

    expect(result.textQueries).toEqual(['same query']);
    expect(result.imageQueries).toEqual(['https://example.com/a.png']);
  });
});
