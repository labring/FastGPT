import { parseUrlToChatFileType } from '../../chat/fileContext';

import { AsyncLocalStorage } from 'async_hooks';
import type { MCPClient } from '../../app/mcp';
import type { WorkflowFileContext } from './fileContext';

type ContextType = {
  mcpClientMemory: Record<string, MCPClient>;
  fileContext?: WorkflowFileContext;
};

export const WorkflowContext = new AsyncLocalStorage<ContextType>();

export const runWithContext = <T>(value: ContextType, fn: (ctx: ContextType) => T): T =>
  WorkflowContext.run(value, () => {
    const store = WorkflowContext.getStore()!;
    return fn(store);
  });

export const getWorkflowContext = (): ContextType => {
  return WorkflowContext.getStore()!;
};

/** 获取当前 Workflow 调用链在入口创建的只读文件上下文。 */
export const getWorkflowFileContext = () => WorkflowContext.getStore()?.fileContext;

export const updateWorkflowContextVal = (val: Partial<ContextType>) => {
  const context = getWorkflowContext();
  if (context) {
    for (const key in val) {
      // @ts-ignore
      context[key] = val[key];
    }
  }
};

/** 结合 workflow 运行态文件元数据，将 URL 解析成 ChatBox 文件结构。 */
export const parseUrlToFileType = (url: string) => {
  const fileContext = getWorkflowFileContext();
  if (fileContext) return fileContext.resolveChatFile(url);

  return parseUrlToChatFileType({ url });
};
