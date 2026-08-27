import { formatFromExtension, toMarkdownBytes } from '@firecrawl/anydoc';
import { anydocDocumentFileExtensions } from '@fastgpt/global/common/file/constants';
import type { ReadFileResponse, ReadRawTextByBuffer } from '../type';

const supportedExtensionSet = new Set<string>(anydocDocumentFileExtensions);

/** 判断扩展名是否应交给 anydoc 补充解析器。 */
export const isAnydocDocumentExtension = (extension: string) =>
  supportedExtensionSet.has(`.${extension.trim().toLowerCase().replace(/^\./, '')}`);

/**
 * 使用 anydoc 将 FastGPT 原解析器未覆盖的文档转换为 Markdown。
 *
 * 扩展名先交给 anydoc 自身做格式族归一化，例如 `.xls` 会映射为 `xlsx`。调用方仍需通过
 * `isAnydocDocumentExtension` 限制路由，避免依赖升级后静默改变 FastGPT 的上传与解析边界。
 */
export const readAnydocRawText = async ({
  buffer,
  extension
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const normalizedExtension = extension.trim().toLowerCase().replace(/^\./, '');
  if (!isAnydocDocumentExtension(normalizedExtension)) {
    throw new Error(`Unsupported anydoc file extension: .${extension.replace(/^\./, '')}`);
  }

  const formatExtension = (() => {
    if (normalizedExtension !== 'wps') return normalizedExtension;

    // WPS 桌面端可能用 .wps 文件名保存 OOXML；其余 .wps 默认复用二进制 DOC 解析器。
    const isOoxmlDocument =
      buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) &&
      buffer.includes(Buffer.from('word/document.xml'));
    return isOoxmlDocument ? 'docx' : 'doc';
  })();
  const format = formatFromExtension(formatExtension);
  if (!format) {
    throw new Error(`Unsupported anydoc file extension: .${normalizedExtension}`);
  }

  return {
    rawText: await toMarkdownBytes(buffer, format)
  };
};
