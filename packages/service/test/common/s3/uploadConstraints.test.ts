import { describe, expect, it } from 'vitest';
import {
  avatarAllowedExtensions,
  createUploadConstraints,
  datasetAllowedExtensions,
  getAllowedExtensionsFromFileSelectConfig,
  getUploadExtensionRulesFromFileSelectConfig,
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
    expect(createUploadConstraints({ filename: 'demo.pdf' })).toMatchObject({
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
    ).toMatchObject({
      defaultContentType: 'image/png',
      allowedExtensions: ['.png', '.jpg']
    });
  });

  it('does not reject missing extension during policy creation', () => {
    expect(
      createUploadConstraints({
        filename: 'avatar',
        uploadConstraints: {
          allowedExtensions: ['.png', '.jpg']
        }
      })
    ).toMatchObject({
      defaultContentType: 'application/octet-stream',
      allowedExtensions: ['.png', '.jpg'],
      allowMissingExtension: true
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

describe('getUploadExtensionRulesFromFileSelectConfig', () => {
  it('keeps custom extensions as opaque rules', () => {
    expect(
      getUploadExtensionRulesFromFileSelectConfig({
        canSelectImg: true,
        canSelectCustomFileExtension: true,
        customFileExtensionList: ['DAT']
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extension: '.png',
          source: 'builtin',
          verification: 'content'
        }),
        expect.objectContaining({
          extension: '.dat',
          source: 'custom',
          verification: 'opaque'
        })
      ])
    );
  });

  it('does not let custom duplicate extensions override builtin content rules', () => {
    expect(
      getUploadExtensionRulesFromFileSelectConfig({
        canSelectImg: true,
        canSelectCustomFileExtension: true,
        customFileExtensionList: ['PNG']
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          extension: '.png',
          source: 'builtin',
          verification: 'content'
        })
      ])
    );
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
