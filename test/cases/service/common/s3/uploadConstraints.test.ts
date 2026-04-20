import { describe, expect, it } from 'vitest';
import {
  avatarAllowedExtensions,
  createUploadConstraints,
  datasetAllowedExtensions,
  getAllowedExtensionsFromFileSelectConfig,
  normalizeAllowedExtensions,
  parseAllowedExtensions
} from '@fastgpt/service/common/s3/utils/uploadConstraints';

describe('normalizeAllowedExtensions', () => {
  it('normalizes casing, leading dots and duplicates', () => {
    expect(normalizeAllowedExtensions(['PNG', '.png', ' .JPG '])).toEqual(['.png', '.jpg']);
  });
});

describe('parseAllowedExtensions', () => {
  it('parses comma-separated extension strings', () => {
    expect(parseAllowedExtensions('.pdf, docx, .MD')).toEqual(['.pdf', '.docx', '.md']);
  });
});

describe('createUploadConstraints', () => {
  it('derives the default content type from the filename', () => {
    expect(createUploadConstraints({ filename: 'demo.pdf' })).toEqual({
      defaultContentType: 'application/pdf'
    });
  });

  it('keeps allowed extensions when the filename is allowed', () => {
    expect(
      createUploadConstraints({
        filename: 'avatar.png',
        uploadConstraints: {
          allowedExtensions: ['.png', '.jpg']
        }
      })
    ).toEqual({
      defaultContentType: 'image/png',
      allowedExtensions: ['.png', '.jpg']
    });
  });

  it('rejects filenames outside the allowed extension list', () => {
    expect(() =>
      createUploadConstraints({
        filename: 'avatar.gif',
        uploadConstraints: {
          allowedExtensions: ['.png', '.jpg']
        }
      })
    ).toThrow('InvalidUploadFileType');
  });
});

describe('getAllowedExtensionsFromFileSelectConfig', () => {
  it('collects enabled extension groups and custom extensions', () => {
    expect(
      getAllowedExtensionsFromFileSelectConfig({
        canSelectFile: true,
        canSelectImg: true,
        canSelectCustomFileExtension: true,
        customFileExtensionList: ['.markdown', 'CSV']
      })
    ).toEqual(
      expect.arrayContaining(['.pdf', '.docx', '.txt', '.jpg', '.png', '.markdown', '.csv'])
    );
  });

  it('returns empty list when upload is disabled', () => {
    expect(getAllowedExtensionsFromFileSelectConfig()).toEqual([]);
  });
});

describe('preset extension lists', () => {
  it('exposes avatar and dataset defaults', () => {
    expect(avatarAllowedExtensions).toEqual(['.jpg', '.jpeg', '.png']);
    expect(datasetAllowedExtensions).toEqual([
      '.txt',
      '.docx',
      '.csv',
      '.xlsx',
      '.pdf',
      '.md',
      '.html',
      '.pptx'
    ]);
  });
});
