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
