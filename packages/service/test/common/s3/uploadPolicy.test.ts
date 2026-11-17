import { describe, expect, it } from 'vitest';
import {
  createUploadPolicy,
  getUploadInspectBytes
} from '@fastgpt/service/common/s3/uploadPolicy/service';
import { createUploadExtensionRulesFromFileSelectConfig } from '@fastgpt/service/common/s3/uploadPolicy/utils';
import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { validateUploadFile } from '@fastgpt/service/common/s3/validation/upload';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';

describe('createUploadPolicy', () => {
  it('uses the current scope to accept or reject the same mismatched bytes without bypassing the extension allowlist', async () => {
    const config = getTestInstanceConfig().security;
    const original = config.skipFileTypeCheck;
    const input = {
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      ),
      filename: 'owned.jpg',
      uploadConstraints: { allowedExtensions: ['.jpg'] }
    };
    try {
      config.skipFileTypeCheck = false;
      await expect(validateUploadFile(input)).rejects.toThrow(S3ErrEnum.uploadFileTypeMismatch);
      config.skipFileTypeCheck = true;
      await expect(validateUploadFile(input)).resolves.toMatchObject({
        filename: 'owned.jpg',
        contentType: 'image/jpeg'
      });
      await expect(validateUploadFile({ ...input, filename: 'owned.exe' })).rejects.toThrow(
        'InvalidUploadFileType'
      );
      config.skipFileTypeCheck = false;
      await expect(validateUploadFile(input)).rejects.toThrow(S3ErrEnum.uploadFileTypeMismatch);
    } finally {
      config.skipFileTypeCheck = original;
    }
  });

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

  it('rejects Office lock filenames at presign', () => {
    expect(() =>
      createUploadPolicy({
        hint: { filename: '~$report.docx' },
        uploadConstraints: { allowedExtensions: ['.docx'] }
      })
    ).toThrow('InvalidUploadFileType');
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

  it.each(['document.doc', 'document.wps', 'sheet.xls', 'slides.ppt'])(
    'uses a larger inspection window for legacy Office upload %s',
    (filename) => {
      expect(
        getUploadInspectBytes({
          hint: { filename }
        })
      ).toBe(64 * 1024);
    }
  );

  it.each(['document.docm', 'sheet.xlsm', 'book.xlsb', 'slides.pptm', 'show.ppsx'])(
    'uses a larger inspection window for OOXML variant %s',
    (filename) => {
      expect(getUploadInspectBytes({ hint: { filename } })).toBe(64 * 1024);
    }
  );
});
