import React from 'react';
import type { AProps } from './A';

export type MarkdownRendererRuntimeContextValue = {
  showAnimation?: boolean;
  autoPreviewHtmlCodeBlock?: boolean;
  markdownClassName?: string;
  chatAuthData?: AProps['chatAuthData'];
  allowedCitationIds?: AProps['allowedCitationIds'];
  onOpenCiteModal?: AProps['onOpenCiteModal'];
};

/**
 * 仅用于给 react-markdown 的稳定 components 传递 renderer 运行时参数。
 * 不要放上层聊天/工作流业务状态，避免 Markdown 组件变成业务状态容器。
 */
export const MarkdownRendererRuntimeContext =
  React.createContext<MarkdownRendererRuntimeContextValue>({});
