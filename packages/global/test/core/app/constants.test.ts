import { describe, expect, it } from 'vitest';
import { isChatFileAllowedBySelectConfig } from '@fastgpt/global/core/app/constants';

describe('isChatFileAllowedBySelectConfig', () => {
  it('matches configured extensions case-insensitively', () => {
    expect(
      isChatFileAllowedBySelectConfig({
        filename: 'REPORT.PDF',
        fileType: 'file',
        fileSelectConfig: { canSelectFile: true }
      })
    ).toBe(true);
  });

  it('rejects an extension outside configured types', () => {
    expect(
      isChatFileAllowedBySelectConfig({
        filename: 'report.exe',
        fileType: 'file',
        fileSelectConfig: { canSelectFile: true }
      })
    ).toBe(false);
  });

  it('uses MIME category only when filename has no extension', () => {
    expect(
      isChatFileAllowedBySelectConfig({
        filename: 'image',
        contentType: 'image/png',
        fileType: 'image',
        fileSelectConfig: { canSelectImg: true }
      })
    ).toBe(true);
    expect(
      isChatFileAllowedBySelectConfig({
        filename: 'image',
        contentType: 'image/png',
        fileType: 'image',
        fileSelectConfig: { canSelectImg: false }
      })
    ).toBe(false);
  });

  it('allows custom extensions only when custom selection is enabled', () => {
    const file = {
      filename: 'data.dat',
      fileType: 'file' as const,
      fileSelectConfig: { canSelectCustomFileExtension: true, customFileExtensionList: ['DAT'] }
    };
    expect(isChatFileAllowedBySelectConfig(file)).toBe(true);
    expect(
      isChatFileAllowedBySelectConfig({
        ...file,
        fileSelectConfig: { canSelectCustomFileExtension: false, customFileExtensionList: ['DAT'] }
      })
    ).toBe(false);
  });

  it('supports audio when audio is used as an uploaded file', () => {
    expect(
      isChatFileAllowedBySelectConfig({
        filename: 'voice.amr',
        fileType: 'audio',
        fileSelectConfig: { canSelectAudio: true }
      })
    ).toBe(true);
  });
});
