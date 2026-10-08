import { useModelDetail } from '@/web/core/ai/model/useModelDetail';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';
import { useEffect } from 'react';
import { useNodeActions, useNodeValue } from '@/web/core/workflow/editor/react/useNode';

/**
 * 按当前模型能力刷新节点输出的 `invalid` 派生标记，结果写回文档（节点折叠时也照常同步）。
 *
 * `invalid` 不被执行层读取，但会被 Runtime Reference module 用于过滤可引用输出；
 * 在模型目录变化时仍需进入文档语义，不能只放进 Canvas overlay。
 *
 * 模型详情加载或失败时保留原状态不回写；标记全部相等时不提交，避免每次重渲染都推一条历史。
 * 读取基准是节点 scoped snapshot：等待期间节点被删除时 useNode 返回 undefined，
 * 输入被改过时 snapshot 身份变化会带着新值重跑，旧详情不会写回过期结论。
 */
export const useNodeOutputValidity = (nodeId: string) => {
  const nodeActions = useNodeActions(nodeId);
  const inputs = useNodeValue(nodeId, (node) => node?.data.inputs);
  const outputs = useNodeValue(nodeId, (node) => node?.data.outputs);
  const needsModel = outputs?.some((output) => !!output.invalidCondition);
  const { model, loading, error } = useModelDetail({
    modelType: ModelTypeEnum.llm,
    modelId: needsModel
      ? inputs?.find((input) => input.key === NodeInputKeyEnum.aiModelId)?.value
      : undefined,
    model: needsModel
      ? inputs?.find((input) => input.key === NodeInputKeyEnum.aiModel)?.value
      : undefined
  });

  useEffect(() => {
    if (!inputs || !outputs || !needsModel || loading || error) return;
    const llmModelMap = model ? { [model.modelId]: model, [model.model]: model } : {};
    const nextOutputs = outputs.map((output) =>
      output.invalidCondition
        ? {
            ...output,
            invalid: output.invalidCondition({
              // 只读快照与 invalidCondition 入参只差 readonly 修饰，这里不改内容。
              inputs: inputs as unknown as FlowNodeInputItemType[],
              llmModelMap
            })
          }
        : output
    );
    if (nextOutputs.every((output, index) => output.invalid === outputs[index].invalid)) return;
    nodeActions?.updateNode(() => ({ outputs: nextOutputs as FlowNodeOutputItemType[] }));
  }, [inputs, outputs, needsModel, model, loading, error, nodeActions]);
};
