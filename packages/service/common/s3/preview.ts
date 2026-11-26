import path from 'node:path';
import { normalizeMimeType } from './utils/mime';

/** 识别浏览器可作为文档打开的内容，兼容旧对象的后缀和 MIME。 */
export const isActiveFilePreview = ({
  contentType,
  filename
}: {
  contentType?: string;
  filename?: string;
}): boolean => {
  const mime = normalizeMimeType(contentType, '');
  const extension = path.extname(filename ?? '').toLowerCase();
  return (
    mime === 'text/html' ||
    mime === 'text/xml' ||
    mime === 'application/xml' ||
    mime.endsWith('+xml') ||
    ['.html', '.htm', '.xhtml', '.svg', '.xml', '.xsl', '.xslt'].includes(extension)
  );
};

/**
 * 为可执行的用户文件建立浏览器隔离边界，同时保留 HTML 的脚本、外部资源与页面交互。
 * 不授予 allow-same-origin 或 allow-popups-to-escape-sandbox：文件及其弹窗不能继承主站权限。
 * 禁止被嵌入并隔离 opener，避免文件通过现有页面消息通道间接调用主站。
 * MIME 与文件名任一表明主动内容即启用，覆盖历史对象和 MIME/后缀不一致的情况。
 */
export const getFilePreviewSecurityHeaders = ({
  contentType,
  filename
}: {
  contentType?: string;
  filename?: string;
}): Record<string, string> => {
  if (!isActiveFilePreview({ contentType, filename })) return {};

  return {
    'Content-Security-Policy':
      "sandbox allow-scripts allow-forms allow-modals allow-popups allow-downloads; frame-ancestors 'none'",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'private, no-store'
  };
};
