import type { WorkflowToolDeltaType } from '@fastgpt/global/core/workflow/runtime/sse';

export const TOOL_PARAMS_PREVIEW_MAX_LENGTH = 8192;
export const TOOL_PARAMS_PREVIEW_INTERVAL_MS = 200;

export type ToolParamsStreamUpdate = {
  responseValueId?: string;
  tool: Pick<WorkflowToolDeltaType, 'id'> & { params: string };
};

const getBufferKey = ({ responseValueId, toolId }: { responseValueId?: string; toolId: string }) =>
  `${responseValueId?.length ?? 0}:${responseValueId ?? ''}:${toolId}`;

/**
 * 截取流式工具参数的有界尾部，避免预览渲染成本随完整参数持续增长。
 */
export const getToolParamsPreview = (
  params: string,
  maxLength = TOOL_PARAMS_PREVIEW_MAX_LENGTH
) => {
  const normalizedMaxLength = Math.max(0, Math.floor(maxLength));
  if (params.length <= normalizedMaxLength) return params;
  if (normalizedMaxLength === 0) return '';

  return params.slice(-normalizedMaxLength);
};

/**
 * 在 React state 之外累积完整工具参数，只向 UI 发布低频、有界的尾部快照。
 * `flush` 用于流结束收尾，会返回并清空完整参数，确保历史记录和后续上下文不丢数据。
 */
export const createToolParamsStreamBuffer = ({
  previewMaxLength = TOOL_PARAMS_PREVIEW_MAX_LENGTH
}: {
  previewMaxLength?: number;
} = {}) => {
  const buffers = new Map<
    string,
    Omit<ToolParamsStreamUpdate, 'tool'> & {
      toolId: string;
      chunks: string[];
      preview: string;
      dirty: boolean;
    }
  >();

  const append = ({ responseValueId, tool }: ToolParamsStreamUpdate) => {
    if (!tool.params) return false;

    const key = getBufferKey({ responseValueId, toolId: tool.id });
    const current = buffers.get(key);
    if (current) {
      current.chunks.push(tool.params);
      current.preview =
        tool.params.length >= previewMaxLength
          ? getToolParamsPreview(tool.params, previewMaxLength)
          : getToolParamsPreview(`${current.preview}${tool.params}`, previewMaxLength);
      current.dirty = true;
    } else {
      buffers.set(key, {
        responseValueId,
        toolId: tool.id,
        chunks: [tool.params],
        preview: getToolParamsPreview(tool.params, previewMaxLength),
        dirty: true
      });
    }

    return true;
  };

  const takePreviewUpdates = (): ToolParamsStreamUpdate[] => {
    const updates: ToolParamsStreamUpdate[] = [];

    buffers.forEach((buffer) => {
      if (!buffer.dirty) return;

      buffer.dirty = false;
      updates.push({
        responseValueId: buffer.responseValueId,
        tool: {
          id: buffer.toolId,
          params: buffer.preview
        }
      });
    });

    return updates;
  };

  const flush = (): ToolParamsStreamUpdate[] => {
    const updates = Array.from(buffers.values(), ({ responseValueId, toolId, chunks }) => ({
      responseValueId,
      tool: {
        id: toolId,
        params: chunks.join('')
      }
    }));
    buffers.clear();

    return updates;
  };

  const clear = () => {
    buffers.clear();
  };

  return {
    append,
    takePreviewUpdates,
    flush,
    clear
  };
};
