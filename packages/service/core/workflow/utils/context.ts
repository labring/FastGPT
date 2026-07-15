import type { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
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

/**
 * 从当前轮用户输入建立 URL 到聊天文件类型的映射。
 *
 * 私有文件会在工作流启动前从稳定 key 恢复成无后缀短链，无法再依赖 URL 后缀推断媒体类型。
 * 该映射保留前端已经确认的 image/audio/video/file 类型，供所有下游节点统一解析 userFiles。
 */
export const buildQueryUrlTypeMap = (query: UserChatItemValueItemType[]) =>
  query.reduce<Record<string, ChatFileTypeEnum>>((map, item) => {
    if (item.file?.url) {
      map[item.file.url] = item.file.type;
    }
    return map;
  }, {});

/** 结合 workflow 运行态 URL 类型映射，将 URL 解析成 ChatBox 文件结构。 */
export const parseUrlToFileType = (url: string) =>
  parseUrlToChatFileType({
    url,
    urlTypeMap: getWorkflowContext()?.queryUrlTypeMap
  });
