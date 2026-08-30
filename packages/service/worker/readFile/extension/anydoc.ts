import { formatFromExtension, toMarkdownBytes } from '@fastgpt-sdk/anydoc';
import { anydocDocumentFileExtensions } from '@fastgpt/global/common/file/constants';
import pLimit from 'p-limit';
import path from 'node:path';
import { toTransferableArrayBuffer } from '../../utils/base64ImageUpload';
import type { ReadFileResponse, ReadRawTextByBuffer, UploadFileHandler } from '../type';

const supportedExtensionSet = new Set<string>(anydocDocumentFileExtensions);
const MAX_EMBEDDED_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_EMBEDDED_IMAGE_TOTAL_BYTES = 200 * 1024 * 1024;
const EMBEDDED_IMAGE_UPLOAD_CONCURRENCY = 5;

/** 判断扩展名是否应交给 anydoc 补充解析器。 */
export const isAnydocDocumentExtension = (extension: string) =>
  supportedExtensionSet.has(`.${extension.trim().toLowerCase().replace(/^\./, '')}`);

/**
 * 使用 anydoc 将 FastGPT 原解析器未覆盖的文档转换为 Markdown。
 *
 * 扩展名先交给 anydoc 自身做格式族归一化，例如 `.xls` 会映射为 `xlsx`。调用方仍需通过
 * `isAnydocDocumentExtension` 限制路由，避免依赖升级后静默改变 FastGPT 的上传与解析边界。
 */
export const readAnydocRawText = async (
  { buffer, extension }: ReadRawTextByBuffer,
  { uploadFile }: { uploadFile?: UploadFileHandler } = {}
): Promise<ReadFileResponse> => {
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

  const { markdown, assets } = await toMarkdownBytes(buffer, format, {
    embeddedImageMode: 'reference',
    maxImageBytes: MAX_EMBEDDED_IMAGE_BYTES,
    maxImageTotalBytes: MAX_EMBEDDED_IMAGE_TOTAL_BYTES
  });

  if (assets.length === 0) {
    if (/asset:\d+/.test(markdown)) {
      throw new Error('Anydoc returned an embedded image reference without its asset');
    }
    return { rawText: markdown };
  }
  if (!uploadFile) {
    throw new Error('Missing imageKeyOptions.prefix for parsed document image upload');
  }

  const limit = pLimit(EMBEDDED_IMAGE_UPLOAD_CONCURRENCY);
  const uploadResults = await Promise.allSettled(
    assets.map((asset) =>
      limit(async () => {
        // N-API asset 使用不可 transfer 的 external Buffer；只在槽位启动时复制一次，并立即解除原引用。
        const transferableBuffer = toTransferableArrayBuffer(asset.data, { forceCopy: true });
        asset.data = Buffer.alloc(0);
        const { key } = await uploadFile({
          name: path.posix.basename(asset.originPart) || `asset-${asset.id}`,
          mime: asset.mediaType,
          buffer: transferableBuffer
        });
        return [asset.id, key] as const;
      })
    )
  );
  const failedUpload = uploadResults.find((result) => result.status === 'rejected');
  if (failedUpload) throw failedUpload.reason;

  const uploadedAssets = uploadResults.map((result) => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
  const uploadedAssetMap = new Map(uploadedAssets);
  const rawText = markdown.replace(/asset:(\d+)/g, (reference, id: string) => {
    const key = uploadedAssetMap.get(Number(id));
    if (!key) throw new Error(`Missing uploaded anydoc asset: ${reference}`);
    return key;
  });

  return { rawText };
};
