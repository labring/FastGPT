import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import { type RuntimeEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { type RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

export const updateToolInputValue = ({
  params,
  inputs
}: {
  params: Record<string, any>;
  inputs: FlowNodeInputItemType[];
}) => {
  /**
   * Tool workflow 的输入 schema 来自原始节点；这里只覆盖本次 tool call 传入的参数。
   * 使用 ?? 保留 0/false/'' 这类有效值，只有 null/undefined 才回退到节点默认值。
   */
  return inputs.map((input) => ({
    ...input,
    value: params[input.key] ?? input.value
  }));
};

export const filterToolResponseToPreview = (response: AIChatItemValueItemType[]) => {
  return response.map((item) => {
    if (item.tools) {
      /**
       * 工具响应可能很长，预览只保留头尾，完整响应仍保存在原始运行结果里。
       */
      const formatTools = item.tools?.map((tool) => {
        return {
          ...tool,
          response: sliceStrStartEnd(tool.response, 500, 500)
        };
      });
      return {
        ...item,
        tools: formatTools
      };
    }

    return item;
  });
};

export const formatToolResponse = (toolResponses: any) => {
  if (typeof toolResponses === 'object') {
    return JSON.stringify(toolResponses, null, 2);
  }

  /**
   * 非对象的空结果给 LLM 一个稳定字符串，避免 undefined 被拼进上下文后语义不清。
   */
  return toolResponses ? String(toolResponses) : 'none';
};

/**
 * 这些 runtime edge/node 是为一次 tool workflow 派生出的副本。
 * 初始化阶段直接在副本上标记入口状态，避免后续调度还要维护额外的 entry 集合。
 */
export const initToolCallEdges = (edges: RuntimeEdgeItemType[], entryNodeIds: string[]) => {
  edges.forEach((edge) => {
    if (entryNodeIds.includes(edge.target)) {
      edge.status = 'active';
    }
  });
};

export const initToolNodes = (
  nodes: RuntimeNodeItemType[],
  entryNodeIds: string[],
  startParams?: Record<string, any>
) => {
  nodes.forEach((node) => {
    if (entryNodeIds.includes(node.nodeId)) {
      node.isEntry = true;
      if (startParams) {
        /**
         * 只给入口节点注入 tool call 参数；非入口节点仍由 workflow 边和上游输出驱动。
         */
        node.inputs = updateToolInputValue({ params: startParams, inputs: node.inputs });
      }
    }
  });
};
