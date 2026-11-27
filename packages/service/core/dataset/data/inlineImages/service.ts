import { createHash } from 'node:crypto';
import {
  matchDocumentImages,
  parseBase64ImageDataUrl,
  unescapeMarkdownImageUrl,
  type DocumentImageItem
} from '@fastgpt/global/common/string/markdown';
import { UserError } from '@fastgpt/global/common/error/utils';
import { addHours } from 'date-fns';
import { getOrCreateChunkImagePrefixId } from '../../collection/entity';
import {
  countChunkImagesInContent,
  createChunkImageKey,
  MAX_INLINE_IMAGES_PER_DATA_ITEM,
  parseChunkImageKey
} from './utils';
import { normalizeMimeType, resolveMimeExtension } from '../../../../common/s3/utils/mime';
import { isValidImageContentType } from '../../../../common/file/image/utils';
import { validateUploadFile } from '../../../../common/s3/validation/upload';
import { registerS3TTL, uploadImage2S3Bucket } from '../../../../common/s3/utils';

/** 单张内联图片允许的最大解码字节数（10 MB），解码前按 Base64 长度预检，避免先分配超大 Buffer。 */
export const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024;

/** 覆盖 CommonMark 允许对 ASCII 标点（`:`、`/`）进行反斜杠转义的写法，如 `data:image\/png;base64,...`。 */
const inlineDataImageHintRegex = /data\\?:image\\?\//i;
const inlineDataImageStartRegex = /^data:image\//i;
const base64FormatRegex = /^[A-Za-z0-9+/]+={0,2}$/;

/** 将单个 Base64 字符映射为 0..63 数值，用于 O(1) 校验末尾未使用的填充位是否为 0。 */
const getBase64CharValue = (code: number) => {
  if (code >= 65 && code <= 90) return code - 65; // A-Z
  if (code >= 97 && code <= 122) return code - 71; // a-z
  if (code >= 48 && code <= 57) return code + 4; // 0-9
  if (code === 43) return 62; // +
  if (code === 47) return 63; // /
  return -1;
};

/**
 * 零额外大字符串分配校验规范 Base64 并返回精确解码字节数；
 * 等价于 `Buffer.from(s, 'base64').toString('base64')` 往返校验，避免 8 MB 级图片的整串二次编码内存开销。
 */
const getCanonicalBase64DecodedBytes = (base64: string): number => {
  if (!base64 || !base64FormatRegex.test(base64)) return -1;
  const len = base64.length;
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bodyLen = len - pad;
  if (bodyLen <= 0) return -1;

  if (pad > 0) {
    if (len % 4 !== 0) return -1;
  } else if (bodyLen % 4 === 1) {
    return -1;
  }

  const remainder = bodyLen % 4;
  if (remainder === 2 || remainder === 3) {
    const lastVal = getBase64CharValue(base64.charCodeAt(bodyLen - 1));
    // 2 字符留 4 个低位比特、3 字符留 2 个低位比特，规范 Base64 这些未用位必须为 0。
    const unusedMask = remainder === 2 ? 0x0f : 0x03;
    if (lastVal < 0 || (lastVal & unusedMask) !== 0) return -1;
  }

  return Math.floor((bodyLen * 3) / 4);
};

type ScannedInlineImage = {
  image: DocumentImageItem;
  mime: string;
  base64: string;
  digestKey?: string;
};

type ValidatedInlineFile = {
  filename: string;
  contentType: string;
};

const scanFieldInlineImages = (
  text: string | undefined
): { matches: ScannedInlineImage[]; existingChunkImages: number } => {
  if (!text || !inlineDataImageHintRegex.test(text)) {
    return { matches: [], existingChunkImages: 0 };
  }

  const matches: ScannedInlineImage[] = [];
  let existingChunkImages = 0;

  for (const image of matchDocumentImages(text)) {
    const url = image.format === 'markdown' ? unescapeMarkdownImageUrl(image.url) : image.url;
    if (!inlineDataImageStartRegex.test(url)) {
      if (parseChunkImageKey(url)) existingChunkImages++;
      continue;
    }

    const parsed = parseBase64ImageDataUrl(url);
    if (!parsed) throw new UserError('Invalid inline base64 image');
    const mime = normalizeMimeType(parsed.mime);
    if (!isValidImageContentType(mime)) throw new UserError('Invalid inline base64 image');

    const decodedBytes = getCanonicalBase64DecodedBytes(parsed.base64);
    if (decodedBytes <= 0) throw new UserError('Invalid inline base64 image');
    if (decodedBytes > MAX_INLINE_IMAGE_BYTES) {
      throw new UserError(
        `Inline image size exceeds limit (${Math.floor(MAX_INLINE_IMAGE_BYTES / 1024 / 1024)}MB)`
      );
    }

    matches.push({ image, mime, base64: parsed.base64 });
  }

  return { matches, existingChunkImages };
};

/**
 * 将直接写入的 Base64 图片转存为本集合对象，只替换地址，保留分块与正文。
 * 阶段 1 对整批完成数量（每条最多 3 张）、MIME、规范 Base64、字节上限与实际文件魔数校验（逐图释放 Buffer），
 * 全部通过后再执行任何集合前缀初始化、TTL 登记或 S3 上传；同请求按 SHA-256 摘要去重，避免常驻大 Base64 字符串。
 */
export const normalizeDatasetDataImages = async <T extends { q?: string; a?: string }>({
  teamId,
  datasetId,
  collectionId,
  data
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
  data: T[];
}): Promise<{ data: T[]; imageUploadKeys: string[] }> => {
  // 阶段 1a：纯字符串数量与编码预检，优先拦下超限与非法编码。
  const scannedItems = data.map((item) => {
    const qScan = scanFieldInlineImages(item.q);
    const aScan = scanFieldInlineImages(item.a);
    const newCount = qScan.matches.length + aScan.matches.length;
    if (newCount > 0) {
      // 另一字段不含 Base64 但已有受管内联图时也计入 3 张上限，防止分次编辑绕过。
      const extraExisting = countChunkImagesInContent({
        q: item.q && !inlineDataImageHintRegex.test(item.q) ? item.q : undefined,
        a: item.a && !inlineDataImageHintRegex.test(item.a) ? item.a : undefined
      });
      const totalCount =
        newCount + qScan.existingChunkImages + aScan.existingChunkImages + extraExisting;
      if (totalCount > MAX_INLINE_IMAGES_PER_DATA_ITEM) {
        throw new UserError(
          `Each data item supports at most ${MAX_INLINE_IMAGES_PER_DATA_ITEM} inline images`
        );
      }
    }
    return { item, qMatches: qScan.matches, aMatches: aScan.matches };
  });

  if (
    scannedItems.every(({ qMatches, aMatches }) => qMatches.length === 0 && aMatches.length === 0)
  ) {
    return { data, imageUploadKeys: [] };
  }

  // 阶段 1b：在首次 DB/S3 写入前逐图校验真实字节内容并按摘要缓存结果，单次仅持有一个 Buffer 即可释放。
  const validatedByDigest = new Map<string, ValidatedInlineFile>();
  for (const { qMatches, aMatches } of scannedItems) {
    for (const entry of [...qMatches, ...aMatches]) {
      const buffer = Buffer.from(entry.base64, 'base64');
      const digestKey = `${entry.mime}:${createHash('sha256').update(buffer).digest('hex')}`;
      entry.digestKey = digestKey;
      if (!validatedByDigest.has(digestKey)) {
        const extension = resolveMimeExtension(entry.mime);
        const file = await validateUploadFile({
          buffer,
          fileHint: { filename: `image${extension}`, contentType: entry.mime },
          uploadConstraints: { allowedExtensions: [extension] }
        });
        validatedByDigest.set(digestKey, {
          filename: file.filename,
          contentType: file.contentType
        });
      }
    }
  }

  // 阶段 2：全部校验通过后再初始化集合目录、登记 TTL 并按摘要去重上传。
  const uploadedByDigest = new Map<string, string>();
  let chunkImagePrefixId: string | undefined;

  const replaceFieldImages = async (text: string, matches: ScannedInlineImage[]) => {
    if (matches.length === 0) return text;
    let result = '';
    let lastIndex = 0;

    for (const { image, base64, digestKey } of matches) {
      const resolvedDigest = digestKey!;
      let key = uploadedByDigest.get(resolvedDigest);
      if (!key) {
        const file = validatedByDigest.get(resolvedDigest)!;
        const buffer = Buffer.from(base64, 'base64');
        chunkImagePrefixId ??= await getOrCreateChunkImagePrefixId({
          teamId,
          datasetId,
          collectionId
        });
        key = createChunkImageKey({ datasetId, chunkImagePrefixId, filename: file.filename });
        // 存储端写入后抛错也必须有清理依据，不使用上传完成后才登记 TTL 的旧分支。
        await registerS3TTL({
          bucketName: 'private',
          key,
          expiredTime: addHours(new Date(), 3)
        });
        await uploadImage2S3Bucket('private', {
          buffer,
          uploadKey: key,
          filename: file.filename,
          mimetype: file.contentType,
          // 截止时间远短于临时清理窗口，必须终止传输，不能只 race 一个拒绝 Promise。
          uploadTimeoutMs: 120_000
        });
        uploadedByDigest.set(resolvedDigest, key);
      }
      result += text.slice(lastIndex, image.index) + image.replace(key);
      lastIndex = image.index + image.fullMatch.length;
    }

    return result + text.slice(lastIndex);
  };

  const normalized: T[] = [];
  for (const entry of scannedItems) {
    normalized.push({
      ...entry.item,
      ...(entry.item.q !== undefined && {
        q: await replaceFieldImages(entry.item.q, entry.qMatches)
      }),
      ...(entry.item.a !== undefined && {
        a: await replaceFieldImages(entry.item.a, entry.aMatches)
      })
    });
    // 处理完即释放切片引用，避免批量大图在后续条目上传期间持续占堆。
    entry.qMatches.length = 0;
    entry.aMatches.length = 0;
  }

  return { data: normalized, imageUploadKeys: [...uploadedByDigest.values()] };
};
