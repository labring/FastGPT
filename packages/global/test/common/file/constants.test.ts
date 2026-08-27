import { describe, expect, it } from 'vitest';
import {
  anydocDocumentFileExtensions,
  builtInDocumentFileExtensions,
  documentFileExtensions,
  documentFileType
} from '../../../common/file/constants';
import { defaultFileExtensionTypes } from '../../../core/app/constants';

describe('document file extensions', () => {
  it('原有解析格式与 anydoc 补充格式不重叠', () => {
    const builtIn = new Set<string>(builtInDocumentFileExtensions);
    expect(anydocDocumentFileExtensions.filter((extension) => builtIn.has(extension))).toEqual([]);
  });

  it('上传格式与后端可解析格式保持一致', () => {
    expect(defaultFileExtensionTypes.canSelectFile).toEqual(documentFileExtensions);
    expect(documentFileType).toBe(documentFileExtensions.join(', '));
  });

  it('包含旧版 Office、OpenDocument、RTF 和 EPUB', () => {
    expect(anydocDocumentFileExtensions).toEqual(
      expect.arrayContaining(['.doc', '.xls', '.ppt', '.odt', '.ods', '.odp', '.rtf', '.epub'])
    );
  });
});
