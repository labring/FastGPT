import { describe, expect, it } from 'vitest';
import {
  getFilenameFromFormInputFileUrl,
  normalizeFormInputResultFile
} from '@/components/core/chat/components/FormInputResult';

describe('FormInputResult', () => {
  it('extracts the download filename from signed file urls', () => {
    const url =
      'http://localhost:3000/api/system/file/download/token?filename=H6%E4%BA%A7%E5%93%81%E6%A6%82%E8%BF%B0V1.5_tBF8kj.docx';

    expect(getFilenameFromFormInputFileUrl(url)).toBe('H6产品概述V1.5_tBF8kj.docx');
    expect(normalizeFormInputResultFile(url)).toEqual({
      name: 'H6产品概述V1.5_tBF8kj.docx',
      url
    });
  });

  it('keeps explicit file object names', () => {
    expect(
      normalizeFormInputResultFile({
        name: 'H6产品概述V1.5.docx',
        url: 'https://example.com/download.docx'
      })
    ).toEqual({
      name: 'H6产品概述V1.5.docx',
      url: 'https://example.com/download.docx'
    });
  });
});
