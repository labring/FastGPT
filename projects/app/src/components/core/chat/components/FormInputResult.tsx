import React from 'react';
import Markdown from '@/components/Markdown';
import { sanitizeFileSelectValue } from '../../app/FileSelector/utils';

/**
 * 表单输入结果中的单个文件项。
 * 工作流 `formInputResult` 里 fileSelect 字段可能存 URL 字符串或 `{ name, url }` 对象，
 * 归一化后统一为该结构，供流恢复和表单交互回填复用。
 */
export type FormInputResultFileItem = {
  name: string;
  url: string;
};

/**
 * 从文件下载 URL 中解析展示用文件名。
 *
 * FastGPT 签名下载链接通常把真实文件名放在 `filename` query 中（见
 * `/api/system/file/d/alias.exp.sig`），path 段往往只是 token，不可读。
 * 解析优先级：query `filename` > URL path 最后一段 > 原 URL 字符串。
 *
 * @param url - 文件下载地址；非法 URL 时直接返回入参，避免展示层抛错。
 */
export const getFilenameFromFormInputFileUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    const filename = parsedUrl.searchParams.get('filename');
    if (filename) return filename;

    const pathname = parsedUrl.pathname.split('/').pop();
    return pathname ? decodeURIComponent(pathname) : url;
  } catch {
    return url;
  }
};

/**
 * 将 `formInputResult` 中单条文件值归一化为 `{ name, url }`。
 *
 * 兼容两种历史/并存形态：
 * - `string`：仅存下载 URL，文件名由 {@link getFilenameFromFormInputFileUrl} 推导；
 * - `{ name?, url }`：显式 name 优先，缺失时同样从 URL 推导。
 *
 * 无效输入（空字符串、非对象、缺少 url）返回 `undefined`，便于调用方 `.filter(Boolean)` 过滤。
 * 该函数被流恢复（`ChatBox/utils`）、表单交互回填（`RenderUserFormInteractive`）等多处复用。
 */
export const normalizeFormInputResultFile = (
  value: unknown
): FormInputResultFileItem | undefined => {
  if (typeof value === 'string') {
    if (!value) return;
    return {
      name: getFilenameFromFormInputFileUrl(value),
      url: value
    };
  }

  if (!value || typeof value !== 'object') return;

  const file = value as Record<string, unknown>;
  const url = typeof file.url === 'string' ? file.url : undefined;
  if (!url) return;

  return {
    name:
      typeof file.name === 'string' && file.name ? file.name : getFilenameFromFormInputFileUrl(url),
    url
  };
};

/**
 * 获取 fileSelect 的历史展示值。
 *
 * 首次提交时保存的 key/url + name/type 是唯一真源；工作流节点生成的签名 URL
 * 仅在旧历史缺少原始存储值时兜底，避免短链接覆盖文件名和类型。
 */
export const resolveFormInputFileValues = ({
  storedValue,
  runtimeValue
}: {
  storedValue: unknown;
  runtimeValue: unknown;
}) => {
  const storedFiles = sanitizeFileSelectValue(Array.isArray(storedValue) ? storedValue : []);
  if (storedFiles.length > 0) return storedFiles;

  if (!Array.isArray(runtimeValue)) return [];
  return runtimeValue
    .map(normalizeFormInputResultFile)
    .filter((file): file is NonNullable<ReturnType<typeof normalizeFormInputResultFile>> =>
      Boolean(file)
    );
};

/** 将用户提交的完整表单结果统一展示为格式化 JSON。 */
const FormInputResult = React.memo(function FormInputResult({
  value
}: {
  value: Record<string, unknown>;
}) {
  return <Markdown source={`~~~json\n${JSON.stringify(value, null, 2)}`} />;
});

export default FormInputResult;
