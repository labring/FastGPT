import { describe, expect, it } from 'vitest';
import {
  anydocDocumentFileExtensions,
  documentFileExtensions,
  documentFileType
} from '../../../common/file/constants';
import { defaultFileExtensionTypes } from '../../../core/app/constants';

describe('document file extensions', () => {
  it('原有解析格式与 anydoc 补充格式合并后没有重复项', () => {
    expect(new Set(documentFileExtensions).size).toBe(documentFileExtensions.length);
  });

  it('上传格式与后端可解析格式保持一致', () => {
    expect(defaultFileExtensionTypes.canSelectFile).toEqual(documentFileExtensions);
    expect(documentFileType).toBe(documentFileExtensions.join(', '));
  });

  it('包含旧版 Office、OpenDocument、RTF 和 EPUB', () => {
    expect(anydocDocumentFileExtensions).toEqual(
      expect.arrayContaining([
        '.doc',
        '.wps',
        '.xls',
        '.ppt',
        '.odt',
        '.ods',
        '.odp',
        '.rtf',
        '.epub'
      ])
    );
  });
});
