import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';

/**
 * 裁剪 assistantResponses 中的工具响应预览。
 *
 * ToolCall 节点的聊天记录仍保存完整工具响应；节点 answer/output 预览只保留头尾，避免
 * 大工具结果撑爆运行详情和前端列表。
 */
export const filterAgentLoopCoreToolResponseToPreview = (response: AIChatItemValueItemType[]) =>
  response.map((item) => {
    if (!item.tools) return item;

    return {
      ...item,
      tools: item.tools.map((tool) => ({
        ...tool,
        response: sliceStrStartEnd(tool.response, 500, 500)
      }))
    };
  });
