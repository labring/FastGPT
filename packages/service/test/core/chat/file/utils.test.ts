import { describe, expect, it } from 'vitest';
import {
  getFileNameFromUrl,
  getFileUrlIdentity,
  isAbsoluteHttpUrl,
  isSignedDownloadAlias,
  selectFileInputs
} from '@fastgpt/service/core/chat/file/utils';

describe('isSignedDownloadAlias', () => {
  it.each<[string, boolean]>([
    ['workflowFileAlias.hscf3.ExampleSignatureValue1234', true],
    ['report.pdf', false],
    ['workflowFileAlias.hscf3.ExampleSignatureValue1234.txt', false],
    ['%invalid', false],
    ['', false]
  ])('区分短链凭证与文件名：%s', (value, expected) =>
    expect(isSignedDownloadAlias(value)).toBe(expected)
  );
});

describe('getFileNameFromUrl', () => {
  it.each<[string, string | undefined]>([
    ['https://files.example.com/report.pdf?filename=other.docx#part', 'report.pdf'],
    ['https://files.example.com/%E6%B5%8B%E8%AF%95%20%E6%8A%A5%E5%91%8A.pdf', '测试 报告.pdf'],
    ['https://files.example.com/%252Freport.pdf', '%2Freport.pdf'],
    ['https://files.example.com/', undefined],
    ['https://files.example.com/%invalid', undefined],
    ['not a standard url.wav', undefined]
  ])('提取 %s 的路径文件名，失败时交给调用方兜底', (url, expected) => {
    expect(getFileNameFromUrl(url)).toBe(expected);
  });
});

describe('isAbsoluteHttpUrl', () => {
  it.each([
    ['https://files.example.com/a.pdf', true],
    ['http://files.example.com/a.pdf', true],
    ['/api/system/file/d/token', false],
    ['//files.example.com/a.pdf', false],
    ['file:///tmp/a.pdf', false],
    ['data:text/plain,a', false],
    ['ws://files.example.com/a.pdf', false],
    ['http://[invalid', false],
    [undefined, false]
  ])('validates %s', (url, expected) => expect(isAbsoluteHttpUrl(url)).toBe(expected));
});

describe('getFileUrlIdentity', () => {
  it('normalizes HTTP identity without removing signed query parameters', () => {
    expect(getFileUrlIdentity('https://EXAMPLE.com:443/file?signature=one#part')).toBe(
      'external:https://example.com/file?signature=one'
    );
    expect(getFileUrlIdentity('https://example.com/file?signature=two')).not.toBe(
      getFileUrlIdentity('https://example.com/file?signature=one')
    );
    expect(getFileUrlIdentity('chat/private.pdf')).toBe('chat/private.pdf');
  });
});

describe('selectFileInputs', () => {
  it.each([0, -1, 1, 1.9, 5])(
    'deduplicates before enforcing limit %s and preserves input objects',
    (maxFiles) => {
      const first = { id: 'one' };
      const second = { id: 'two' };
      const files = [first, { id: 'one' }, second];
      const result = selectFileInputs({ files, maxFiles, getIdentity: (file) => file.id });
      expect(result).toEqual([first, second].slice(0, Math.max(0, Math.floor(maxFiles))));
      if (result.length) expect(result[0]).toBe(first);
      expect(files).toHaveLength(3);
    }
  );
});
