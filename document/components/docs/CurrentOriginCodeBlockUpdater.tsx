'use client';

import { useEffect, useRef } from 'react';

const DEFAULT_DOC_ORIGIN = 'https://doc.fastgpt.cn';

type CurrentOriginCodeBlockUpdaterProps = {
  fallbackOrigin?: string;
};

/**
 * 在浏览器端把紧邻的 Fumadocs 代码块里的默认文档域名替换为当前访问域名。
 * 这样代码块仍由 MDX/Shiki/Fumadocs 渲染，保留原生样式、高亮和复制按钮。
 */
export function CurrentOriginCodeBlockUpdater({
  fallbackOrigin = DEFAULT_DOC_ORIGIN
}: CurrentOriginCodeBlockUpdaterProps) {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const codeBlock = markerRef.current?.previousElementSibling;

    if (!codeBlock) return;

    const currentOrigin = window.location.origin.replace(/\/$/, '');
    const fallback = fallbackOrigin.replace(/\/$/, '');

    codeBlock.querySelectorAll('span, code').forEach((node) => {
      if (!node.textContent?.includes(fallback)) return;

      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE && child.textContent?.includes(fallback)) {
          child.textContent = child.textContent.replaceAll(fallback, currentOrigin);
        }
      });
    });
  }, [fallbackOrigin]);

  return <span ref={markerRef} data-current-origin-code-block-updater hidden />;
}
