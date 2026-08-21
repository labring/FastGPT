import { describe, expect, it } from 'vitest';
import {
  getFilenameFromFormInputFileUrl,
  normalizeFormInputResultFile,
  resolveFormInputFileValues
} from '@/components/core/chat/components/FormInputResult';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

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

  it('keeps internal file storage values instead of replacing them with runtime urls', () => {
    const storedValue = [
      {
        key: 'chat/app/user/chat/report_xxx.pdf',
        name: 'report.pdf',
        type: ChatFileTypeEnum.file
      }
    ];

    expect(
      resolveFormInputFileValues({
        storedValue,
        runtimeValue: ['http://localhost:3000/api/system/file/d/opaque-token']
      })
    ).toEqual(storedValue);
  });

  it('keeps external file names and urls from the original storage value', () => {
    const storedValue = [
      {
        url: 'https://example.com/download?id=1',
        name: 'external.pdf',
        type: ChatFileTypeEnum.file
      }
    ];

    expect(
      resolveFormInputFileValues({
        storedValue,
        runtimeValue: ['https://runtime.example.com/opaque-token']
      })
    ).toEqual(storedValue);
  });

  it('falls back to runtime urls only when legacy history has no stored file value', () => {
    const runtimeUrl = 'http://localhost:3000/api/system/file/download/token?filename=legacy.pdf';

    expect(
      resolveFormInputFileValues({
        storedValue: [],
        runtimeValue: [runtimeUrl]
      })
    ).toEqual([
      {
        name: 'legacy.pdf',
        url: runtimeUrl
      }
    ]);
  });
});
