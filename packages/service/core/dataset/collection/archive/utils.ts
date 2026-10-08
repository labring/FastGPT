import { createHash } from 'node:crypto';

const MAX_ARCHIVE_SEGMENT_BYTES = 200;
const WINDOWS_RESERVED_NAME_PATTERN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

const splitFileExtension = (name: string) => {
  const extensionIndex = name.lastIndexOf('.');
  if (extensionIndex <= 0 || extensionIndex === name.length - 1) {
    return { stem: name, extension: '' };
  }

  return {
    stem: name.slice(0, extensionIndex),
    extension: name.slice(extensionIndex)
  };
};

const truncateUtf8 = (value: string, maxBytes: number) => {
  let result = '';

  for (const character of value) {
    if (Buffer.byteLength(result + character, 'utf8') > maxBytes) break;
    result += character;
  }

  return result;
};

/**
 * 将单个 ZIP 路径段规范化为跨平台安全名称，并以稳定哈希处理超长名称。
 * 调用方必须逐段处理路径，不能把包含分隔符的完整路径直接传入。
 */
export const sanitizeArchivePathSegment = (rawName: string) => {
  const normalizedName = rawName
    .normalize('NFC')
    .replace(/[<>:"|?*\\/\u0000-\u001f\u007f]/g, '_')
    .replace(/[ .]+$/g, '');
  const nonEmptyName =
    !normalizedName || normalizedName === '.' || normalizedName === '..' ? '_' : normalizedName;
  const safeName = WINDOWS_RESERVED_NAME_PATTERN.test(nonEmptyName.split('.')[0])
    ? `_${nonEmptyName}`
    : nonEmptyName;

  if (Buffer.byteLength(safeName, 'utf8') <= MAX_ARCHIVE_SEGMENT_BYTES) {
    return safeName;
  }

  const safeParts = splitFileExtension(safeName);
  const hash = createHash('sha256').update(safeName).digest('hex').slice(0, 8);
  const suffix = `-${hash}`;
  const suffixBytes = Buffer.byteLength(suffix, 'utf8');
  // 极长扩展名也必须受字节预算约束；为 stem 至少保留一个完整 Unicode 字符的位置。
  const extension = truncateUtf8(safeParts.extension, MAX_ARCHIVE_SEGMENT_BYTES - suffixBytes - 4);
  const stemBudget = MAX_ARCHIVE_SEGMENT_BYTES - Buffer.byteLength(extension, 'utf8') - suffixBytes;

  return `${truncateUtf8(safeParts.stem, stemBudget)}${suffix}${extension}`;
};

/**
 * 在同一 ZIP 目录的统一命名空间中预留名称。比较时忽略大小写并统一 Unicode，
 * 返回值保留首个条目的显示形式，冲突项在扩展名前追加稳定序号。
 */
export const reserveUniqueArchiveName = ({
  rawName,
  usedNames
}: {
  rawName: string;
  usedNames: Set<string>;
}) => {
  const sanitizedName = sanitizeArchivePathSegment(rawName);
  const normalizeKey = (value: string) => value.normalize('NFC').toLocaleLowerCase('en-US');
  const originalKey = normalizeKey(sanitizedName);

  if (!usedNames.has(originalKey)) {
    usedNames.add(originalKey);
    return sanitizedName;
  }

  const { stem, extension } = splitFileExtension(sanitizedName);
  for (let index = 2; ; index += 1) {
    const candidate = sanitizeArchivePathSegment(`${stem} (${index})${extension}`);
    const candidateKey = normalizeKey(candidate);

    if (!usedNames.has(candidateKey)) {
      usedNames.add(candidateKey);
      return candidate;
    }
  }
};
