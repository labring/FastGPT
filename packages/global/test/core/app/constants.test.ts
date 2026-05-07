import { describe, expect, it } from 'vitest';
import { isFileTypeAllowedByAccept } from '@fastgpt/global/core/app/constants';

const createFile = ({ name, type = '' }: { name: string; type?: string }) => ({ name, type });

describe('isFileTypeAllowedByAccept', () => {
  it('accepts extension matches without relying on browser MIME type', () => {
    expect(isFileTypeAllowedByAccept(createFile({ name: 'report.DOCX' }), '.pdf, .docx')).toBe(
      true
    );
  });

  it('accepts MIME wildcard matches', () => {
    expect(
      isFileTypeAllowedByAccept(createFile({ name: 'photo', type: 'image/png' }), 'image/*')
    ).toBe(true);
  });

  it('accepts custom extensions without a leading dot', () => {
    expect(isFileTypeAllowedByAccept(createFile({ name: 'data.jsonl' }), 'jsonl')).toBe(true);
  });

  it('rejects unmatched files', () => {
    expect(
      isFileTypeAllowedByAccept(
        createFile({ name: 'movie.mp4', type: 'video/mp4' }),
        '.pdf, image/*'
      )
    ).toBe(false);
  });
});
