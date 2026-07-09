import { describe, expect, it } from 'vitest';
import {
  createUploadPolicy,
  getUploadInspectBytes
} from '@fastgpt/service/common/s3/uploadPolicy/service';
import { createUploadExtensionRulesFromFileSelectConfig } from '@fastgpt/service/common/s3/uploadPolicy/utils';

describe('createUploadPolicy', () => {
  it('does not reject missing extension and uses contentType as fallback hint', () => {
    expect(
      createUploadPolicy({
        hint: {
          filename: 'image',
          contentType: 'image/png'
        },
        uploadConstraints: {
          allowedExtensions: ['.png']
        }
      })
    ).toMatchObject({
      defaultContentType: 'image/png',
      allowedExtensions: ['.png'],
      fallbackExtension: '.png',
      allowMissingExtension: true
    });
  });

  it('keeps custom fileSelectConfig extensions as opaque rules', () => {
    const extensionRules = createUploadExtensionRulesFromFileSelectConfig({
      canSelectCustomFileExtension: true,
      customFileExtensionList: ['DAT']
    });

    expect(
      createUploadPolicy({
        hint: {
          filename: 'data.dat'
        },
        uploadConstraints: {
          allowedExtensions: ['.dat'],
          extensionRules
        }
      })
    ).toMatchObject({
      defaultContentType: 'application/octet-stream',
      allowedExtensions: ['.dat'],
      extensionRules: [
        {
          extension: '.dat',
          source: 'custom',
          verification: 'opaque'
        }
      ],
      fallbackExtension: '.dat'
    });
  });
});

describe('getUploadInspectBytes', () => {
  it('uses larger window when policy allows extensionless OOXML upload', () => {
    expect(
      getUploadInspectBytes({
        hint: {
          filename: 'document'
        },
        policy: {
          defaultContentType: 'application/octet-stream',
          allowedExtensions: ['.docx']
        }
      })
    ).toBe(64 * 1024);
  });
});
