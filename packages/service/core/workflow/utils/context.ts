import { parseUrlToChatFileType } from '../../chat/fileContext';

import { AsyncLocalStorage } from 'async_hooks';
import type { MCPClient } from '../../app/mcp';
import { isAbsoluteHttpUrl } from './fileContext';
import type { WorkflowFileContext, WorkflowFileRegistrar } from './fileContext';

type ContextType = {
  mcpClientMemory: Record<string, MCPClient>;
  fileContext?: WorkflowFileContext;
  fileRegistrar?: WorkflowFileRegistrar;
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

/** 获取只供 Workflow 输入适配器使用的文件登记能力。 */
export const getWorkflowFileRegistrar = () => WorkflowContext.getStore()?.fileRegistrar;

/** 优先直读当前 Workflow 已登记文件，未登记的绝对外链交给带 SSRF 防护的 reader。 */
export const readWorkflowFileBuffer = async ({
  url,
  readExternalFile
}: {
  url: string;
  readExternalFile: (url: string) => Promise<Buffer>;
}) => {
  const fileContext = getWorkflowFileContext();
  const ref = fileContext?.resolve(url);
  if (fileContext && ref) return (await fileContext.read(ref)).buffer;

  return readExternalFile(url);
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

/** 结合 workflow 运行态文件元数据，将 URL 解析成 ChatBox 文件结构。 */
export const parseUrlToFileType = (url: string) => {
  const fileContext = getWorkflowFileContext();
  const workflowFile = fileContext?.resolveChatFile(url);
  if (workflowFile) return workflowFile;
  if (fileContext && !isAbsoluteHttpUrl(url)) return;

  return parseUrlToChatFileType({ url });
};
