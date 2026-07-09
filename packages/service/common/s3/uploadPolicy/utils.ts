import {
  defaultFileExtensionTypes,
  type FileExtensionKeyType
} from '@fastgpt/global/core/app/constants';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type/config.schema';
import path from 'node:path';
import {
  DEFAULT_CONTENT_TYPE,
  normalizeMimeType,
  resolveMimeExtension,
  resolveMimeType
} from '../utils/mime';
import type { UploadExtensionRule, UploadPolicy } from './type';

const uploadConfigKeys: FileExtensionKeyType[] = [
  'canSelectFile',
  'canSelectImg',
  'canSelectVideo',
  'canSelectAudio',
  'canSelectCustomFileExtension'
];

const textLikeMimePrefixes = ['text/'];
const textLikeMimeSet = new Set([
  'application/javascript',
  'application/json',
  'application/ld+json',
  'application/markdown',
  'application/x-javascript',
  'application/xml',
  'image/svg+xml'
]);
const textLikeExtensions = new Set([
  '.csv',
  '.htm',
  '.html',
  '.json',
  '.log',
  '.md',
  '.markdown',
  '.svg',
  '.txt',
  '.xml',
  '.yaml',
  '.yml'
]);

export const defaultInspectBytes = 8192;
export const officeZipInspectBytes = 64 * 1024;

export const officeZipFormats = [
  {
    extension: '.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    markers: ['word/', 'word/document.xml']
  },
  {
    extension: '.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    markers: ['xl/', 'xl/workbook.xml']
  },
  {
    extension: '.pptx',
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    markers: ['ppt/', 'ppt/presentation.xml']
  }
] as const;

/**
 * 统一扩展名格式。上传策略中所有 extension 都必须小写并带 `.`，避免同一白名单
 * 在预签、上传校验和 metadata 修正阶段出现不同表示。
 */
export const normalizeFileExtension = (extension?: string) => {
  if (!extension) return '';

  const trimmedExtension = extension.trim().toLowerCase();
  if (!trimmedExtension) return '';

  return trimmedExtension.startsWith('.') ? trimmedExtension : `.${trimmedExtension}`;
};

export const normalizeAllowedExtensions = (extensions?: string[]) => {
  if (!extensions?.length) return [];

  return [...new Set(extensions.map(normalizeFileExtension).filter(Boolean))];
};

export const parseAllowedExtensions = (value: string) => {
  return normalizeAllowedExtensions(value.split(','));
};

export const decodeFileName = (filename?: string) => {
  if (!filename) return '';
  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
};

export const getFilenameExtension = (filename?: string) => {
  return normalizeFileExtension(path.extname(decodeFileName(filename)));
};

export const isTextLikeMime = (mime: string) => {
  const normalizedMime = normalizeMimeType(mime, '');
  return (
    textLikeMimePrefixes.some((prefix) => normalizedMime.startsWith(prefix)) ||
    textLikeMimeSet.has(normalizedMime)
  );
};

const isTextLikeExtension = (extension: string) => {
  const normalizedExtension = normalizeFileExtension(extension);
  if (textLikeExtensions.has(normalizedExtension)) return true;

  const mime = resolveMimeType([normalizedExtension], '');
  return Boolean(mime) && isTextLikeMime(mime);
};

export const replaceFilenameExtension = (filename: string, extension: string) => {
  const normalizedExtension = normalizeFileExtension(extension);
  if (!normalizedExtension) return filename;

  const currentExtension = getFilenameExtension(filename);
  if (!currentExtension) {
    return `${filename}${normalizedExtension}`;
  }

  return `${filename.slice(0, -currentExtension.length)}${normalizedExtension}`;
};

export const getOfficeZipFormatByExtension = (extension: string) =>
  officeZipFormats.find((format) => format.extension === normalizeFileExtension(extension));

export const detectOfficeDocumentMime = ({
  buffer,
  detectedMime
}: {
  buffer: Buffer;
  detectedMime?: string;
}) => {
  if (detectedMime && detectedMime !== 'application/zip') return;

  return officeZipFormats.find((format) =>
    format.markers.some((marker) => buffer.includes(Buffer.from(marker, 'utf8')))
  );
};

/**
 * mime-types（按扩展名）与 file-type（按魔数）对同一容器可能给出不同登记名，例如 .avi：
 * lookup → video/x-msvideo，file-type → video/vnd.avi。.mpeg：lookup → video/mpeg，file-type 可能为
 * video/MP1S（MPEG-1 PS）、video/MP2P（MPEG-2 PS）或 video/mpeg（模糊检测）。
 * .m4a：lookup → audio/mp4（RFC），file-type（ftyp M4A）→ audio/x-m4a。
 * 比较前统一小写（忽略参数、大小写差异）。
 */
const MIME_EQUIVALENCE_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(['video/x-msvideo', 'video/vnd.avi', 'video/avi', 'video/msvideo']),
  new Set(['video/mpeg', 'video/mp1s', 'video/mp2p']),
  new Set(['audio/mp4', 'audio/x-m4a'])
];

const normalizeMimeForCompare = (mime: string) => mime.split(';')[0]?.trim().toLowerCase() || '';

export const mimesMatchForUpload = (expected: string, detected: string): boolean => {
  const normalizedExpected = normalizeMimeForCompare(expected);
  const normalizedDetected = normalizeMimeForCompare(detected);
  if (normalizedExpected === normalizedDetected) return true;
  for (const group of MIME_EQUIVALENCE_GROUPS) {
    if (group.has(normalizedExpected) && group.has(normalizedDetected)) return true;
  }
  return false;
};

export const resolveAllowedExtensionForMime = ({
  allowedExtensions,
  mime
}: {
  allowedExtensions: string[];
  mime: string;
}) => {
  return (
    allowedExtensions.find((extension) => {
      const allowedMime = resolveMimeType([extension], '');
      return Boolean(allowedMime) && mimesMatchForUpload(allowedMime, mime);
    }) || ''
  );
};

export const resolveAllowedMimeTypes = (extensions: string[]) => {
  return [
    ...new Set(
      normalizeAllowedExtensions(extensions)
        .map((extension) => resolveMimeType([extension], ''))
        .filter(Boolean)
    )
  ];
};

export const resolveExtensionForMime = ({
  mime,
  allowedExtensions
}: {
  mime?: string;
  allowedExtensions?: string[];
}) => {
  if (!mime) return '';

  const normalizedMime = normalizeMimeType(mime, '');
  const allowedExtension = resolveAllowedExtensionForMime({
    allowedExtensions: normalizeAllowedExtensions(allowedExtensions),
    mime: normalizedMime
  });
  if (allowedExtension) return allowedExtension;

  return resolveMimeExtension(normalizedMime);
};

const inferExtensionVerification = (extension: string): UploadExtensionRule['verification'] => {
  const normalizedExtension = normalizeFileExtension(extension);
  if (!normalizedExtension) return 'opaque';
  if (isTextLikeExtension(normalizedExtension)) return 'text';

  const mime = resolveMimeType([normalizedExtension], '');
  if (!mime || mime === DEFAULT_CONTENT_TYPE) return 'opaque';
  return 'content';
};

export const createUploadExtensionRulesFromAllowedExtensions = (
  extensions?: string[]
): UploadExtensionRule[] => {
  return normalizeAllowedExtensions(extensions).map((extension) => ({
    extension,
    source: 'builtin',
    verification: inferExtensionVerification(extension)
  }));
};

export const createUploadExtensionRulesFromFileSelectConfig = (
  config?: AppFileSelectConfigType
): UploadExtensionRule[] => {
  if (!config) return [];

  const rules = uploadConfigKeys.flatMap<UploadExtensionRule>((key) => {
    if (!config[key]) return [];

    const extensions =
      key === 'canSelectCustomFileExtension'
        ? config.customFileExtensionList || []
        : defaultFileExtensionTypes[key];

    return normalizeAllowedExtensions(extensions).map((extension) => ({
      extension,
      source: key === 'canSelectCustomFileExtension' ? 'custom' : 'builtin',
      verification:
        key === 'canSelectCustomFileExtension' ? 'opaque' : inferExtensionVerification(extension)
    }));
  });

  const ruleMap = new Map<string, UploadExtensionRule>();
  for (const rule of rules) {
    if (!ruleMap.has(rule.extension)) {
      ruleMap.set(rule.extension, rule);
    }
  }

  return Array.from(ruleMap.values());
};

export const normalizeUploadExtensionRules = (rules?: UploadExtensionRule[]) => {
  if (!rules?.length) return [];

  return Array.from(
    new Map(
      rules
        .map((rule) => ({
          ...rule,
          extension: normalizeFileExtension(rule.extension)
        }))
        .filter((rule) => Boolean(rule.extension))
        .map((rule) => [rule.extension, rule])
    ).values()
  );
};

export const resolveExtensionRule = ({
  extension,
  policy
}: {
  extension?: string;
  policy: UploadPolicy;
}) => {
  const normalizedExtension = normalizeFileExtension(extension);
  if (!normalizedExtension) return;

  const rules = normalizeUploadExtensionRules(policy.extensionRules);
  return (
    rules.find((rule) => rule.extension === normalizedExtension) ||
    createUploadExtensionRulesFromAllowedExtensions([normalizedExtension])[0]
  );
};
