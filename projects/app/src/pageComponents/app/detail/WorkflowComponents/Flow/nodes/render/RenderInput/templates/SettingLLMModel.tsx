import React, { useCallback } from 'react';
import type { RenderInputProps } from '../type';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useNode, useNodeActions } from '@/web/core/workflow/editor/react/useNode';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useLocalStorageState } from 'ahooks';
import { Input_Template_SettingAiModel } from '@fastgpt/global/core/workflow/template/input';

/**
 * 模型配置模板：一次表单提交可能同时改多个字段（模型、上限、温度等），
 * 因此按记录级变更处理——读文档当前 inputs、合并全部改动后一次 updateNode 提交，
 * 保证一次交互只产生一条可撤销历史。
 */
const SelectAiModelRender = ({ nodeId, settingLLMModelProps }: RenderInputProps) => {
  const nodeActions = useNodeActions(nodeId);
  const currentInputs = useNode(nodeId, (node) => node?.data.inputs) ?? [];
  const getCurrentInput = (key: string) => currentInputs.find((input) => input.key === key);
  const aiModelIdInput = getCurrentInput(NodeInputKeyEnum.aiModelId);
  const aiModelInput = getCurrentInput(NodeInputKeyEnum.aiModel);
  const maxTokenInput = getCurrentInput(NodeInputKeyEnum.aiChatMaxToken);
  const temperatureInput = getCurrentInput(NodeInputKeyEnum.aiChatTemperature);
  const responseTextInput = getCurrentInput(NodeInputKeyEnum.aiChatIsResponseText);
  const visionInput = getCurrentInput(NodeInputKeyEnum.aiChatVision);
  const audioInput = getCurrentInput(NodeInputKeyEnum.aiChatAudio);
  const videoInput = getCurrentInput(NodeInputKeyEnum.aiChatVideo);
  const extractFilesInput = getCurrentInput(NodeInputKeyEnum.aiChatExtractFiles);
  const reasoningInput = getCurrentInput(NodeInputKeyEnum.aiChatReasoning);
  const reasoningEffortInput = getCurrentInput(NodeInputKeyEnum.aiChatReasoningEffort);
  const topPInput = getCurrentInput(NodeInputKeyEnum.aiChatTopP);
  const stopSignInput = getCurrentInput(NodeInputKeyEnum.aiChatStopSign);
  const responseFormatInput = getCurrentInput(NodeInputKeyEnum.aiChatResponseFormat);
  const jsonSchemaInput = getCurrentInput(NodeInputKeyEnum.aiChatJsonSchema);
  const [, setDefaultModel] = useLocalStorageState<string>('workflow_default_llm_model', {
    defaultValue: ''
  });

  const onChangeModel = useCallback(
    (e: SettingAIDataType) => {
      // 本地默认模型缓存是副作用，放在 patch 之外，保持 patch 函数纯粹。
      // aiModelId 声明为 string；顺带挡掉 undefined，避免写坏缓存。
      const modelIdValue = (e as Record<string, unknown>)[NodeInputKeyEnum.aiModelId];
      if (typeof modelIdValue === 'string') setDefaultModel(modelIdValue);

      // 整表合并以派发瞬间的 inputs 为基线，避免覆盖同一 tick 内的其他写入。
      nodeActions?.updateNode((current) => {
        const nextInputs = [...current.inputs];
        const setValueByKey = (key: string, value: unknown) => {
          const index = nextInputs.findIndex((input) => input.key === key);
          if (index >= 0) nextInputs[index] = { ...nextInputs[index], value };
        };

        for (const key in e) {
          const value = e[key as keyof SettingAIDataType];

          if (key !== NodeInputKeyEnum.aiModelId) {
            setValueByKey(key, value);
            continue;
          }

          if (typeof value !== 'string') continue;
          const legacyIndex = nextInputs.findIndex(
            (input) => input.key === NodeInputKeyEnum.aiModel
          );
          const modelIdIndex = nextInputs.findIndex(
            (input) => input.key === NodeInputKeyEnum.aiModelId
          );
          if (modelIdIndex >= 0) {
            nextInputs[modelIdIndex] = { ...nextInputs[modelIdIndex], value };
            // 迁移后同时存在旧字段时删除，避免两份模型值。
            if (legacyIndex >= 0) nextInputs.splice(legacyIndex, 1);
          } else if (legacyIndex >= 0) {
            // 旧 aiModel 记录原地改名为 aiModelId，保留其余元数据。
            nextInputs[legacyIndex] = {
              ...nextInputs[legacyIndex],
              key: NodeInputKeyEnum.aiModelId,
              value
            };
          } else {
            nextInputs.push({ ...Input_Template_SettingAiModel, value });
          }
        }

        return { inputs: nextInputs };
      });
    },
    [nodeActions, setDefaultModel]
  );

  const model = (aiModelIdInput ?? aiModelInput)?.value as string | undefined;

  const llmModelData: SettingAIDataType = useMemoEnhance(
    () => ({
      modelId: model,
      maxToken: maxTokenInput?.value,
      temperature: temperatureInput?.value,
      isResponseAnswerText: responseTextInput?.value,
      aiChatVision: visionInput?.value ?? true,
      aiChatAudio: audioInput?.value ?? false,
      aiChatVideo: videoInput?.value ?? false,
      aiChatExtractFiles: extractFilesInput?.value ?? true,
      aiChatReasoning: reasoningInput?.value ?? true,
      aiChatReasoningEffort: reasoningEffortInput?.value,
      aiChatTopP: topPInput?.value,
      aiChatStopSign: stopSignInput?.value,
      aiChatResponseFormat: responseFormatInput?.value,
      aiChatJsonSchema: jsonSchemaInput?.value
    }),
    [
      audioInput,
      extractFilesInput,
      jsonSchemaInput,
      maxTokenInput,
      model,
      reasoningEffortInput,
      reasoningInput,
      responseFormatInput,
      responseTextInput,
      stopSignInput,
      temperatureInput,
      topPInput,
      videoInput,
      visionInput
    ]
  );

  return (
    <SettingLLMModel
      defaultData={llmModelData}
      onChange={onChangeModel}
      {...settingLLMModelProps}
    />
  );
};

export default React.memo(SelectAiModelRender);
