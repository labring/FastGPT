import type { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { parseUrlToChatFileType } from '../../chat/fileContext';

import { AsyncLocalStorage } from 'async_hooks';
import type { MCPClient } from '../../app/mcp';

type ContextType = {
  queryUrlTypeMap: Record<string, ChatFileTypeEnum>;
  mcpClientMemory: Record<string, MCPClient>;
};

export const WorkflowContext = new AsyncLocalStorage<ContextType>();

export const runWithContext = (value: ContextType, fn: (ctx: ContextType) => void) => {
  WorkflowContext.run(value, () => {
    const store = WorkflowContext.getStore()!;
    fn(store);
  });
};

export const getWorkflowContext = (): ContextType => {
  return WorkflowContext.getStore()!;
};

export const updateWorkflowContextVal = (val: Partial<ContextType>) => {
  const context = getWorkflowContext();
  if (context) {
    for (const key in val) {
      // @ts-ignore
      context[key] = val[key];
    }
  }
};

/** 结合 workflow 运行态 URL 类型映射，将 URL 解析成 ChatBox 文件结构。 */
export const parseUrlToFileType = (url: string) =>
  parseUrlToChatFileType({
    url,
    urlTypeMap: getWorkflowContext()?.queryUrlTypeMap
  });
