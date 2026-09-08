import { useModelDetail } from '@/web/core/ai/model/useModelDetail';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useEffect } from 'react';
import { useContextSelector } from 'use-context-selector';
import { WorkflowBufferDataContext, WorkflowInitContext } from '../../context/workflowInitContext';

/** 节点折叠时仍同步输出能力；加载或失败时保留原状态，只将结果应用到未变化的输入。 */
export const useNodeOutputValidity = (nodeId: string) => {
  const node = useContextSelector(
    WorkflowInitContext,
    (state) => state.nodes.find((item) => item.id === nodeId)?.data
  );
  const setNodes = useContextSelector(WorkflowBufferDataContext, (state) => state.setNodes);
  const needsModel = node?.outputs.some((output) => !!output.invalidCondition);
  const { model, loading, error } = useModelDetail({
    modelType: ModelTypeEnum.llm,
    modelId: needsModel
      ? node?.inputs.find((input) => input.key === NodeInputKeyEnum.aiModelId)?.value
      : undefined,
    model: needsModel
      ? node?.inputs.find((input) => input.key === NodeInputKeyEnum.aiModel)?.value
      : undefined
  });

  useEffect(() => {
    if (!node || !needsModel || loading || error) return;
    const llmModelMap = model ? { [model.modelId]: model, [model.model]: model } : {};
    setNodes((nodes) => {
      const current = nodes.find((item) => item.id === nodeId);
      // 等待期间删除节点或修改输入后，旧详情不能回写；输出从最新状态计算以保留其他编辑。
      if (!current || current.data.inputs !== node.inputs) return nodes;
      const outputs = current.data.outputs.map((output) =>
        output.invalidCondition
          ? { ...output, invalid: output.invalidCondition({ inputs: node.inputs, llmModelMap }) }
          : output
      );
      if (outputs.every((output, index) => output.invalid === current.data.outputs[index].invalid))
        return nodes;
      return nodes.map((item) =>
        item === current ? { ...item, data: { ...item.data, outputs } } : item
      );
    });
  }, [node, nodeId, needsModel, model, loading, error, setNodes]);
};
