/**
 * 将外部文件名收敛为可写入 sandbox user_files 的单个 path segment。
 * URL query 和 API body 都可能携带文件名，因此调用方不能信任原始 name。
 */
export const getSafeAgentInputFilename = (
  filename: string,
  index: number,
  usedNames: Map<string, number>
) => {
  const fallbackName = `file-${index}`;
  const normalized = filename.replace(/\\/g, '/').split('/').pop()?.trim() || fallbackName;
  const withoutControlChars = normalized.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  const baseName =
    withoutControlChars && withoutControlChars !== '.' && withoutControlChars !== '..'
      ? withoutControlChars
      : fallbackName;
  const firstDotIndex = baseName.indexOf('.');
  const stem = firstDotIndex > 0 ? baseName.slice(0, firstDotIndex) : baseName;
  const extension = firstDotIndex > 0 ? baseName.slice(firstDotIndex) : '';
  const count = usedNames.get(baseName) || 0;
  usedNames.set(baseName, count + 1);

  return count === 0 ? baseName : `${stem}-${count}${extension}`;
};
