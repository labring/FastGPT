import React, { useCallback } from 'react';
import type { RenderInputProps } from '../type';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useLocalStorageState } from 'ahooks';
import { Input_Template_SettingAiModel } from '@fastgpt/global/core/workflow/template/input';

const SelectAiModelRender = ({ inputs = [], nodeId, settingLLMModelProps }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const [, setDefaultModel] = useLocalStorageState<string>('workflow_default_llm_model', {
    defaultValue: ''
  });

  const onChangeModel = useCallback(
    (e: SettingAIDataType) => {
      for (const key in e) {
        if (key === NodeInputKeyEnum.aiModelId) {
          const modelId = e[key];
          if (modelId === undefined) continue;
          setDefaultModel(modelId);
          const modelIdInput = inputs.find((input) => input.key === NodeInputKeyEnum.aiModelId);
          if (modelIdInput) {
            const legacyInput = inputs.find((input) => input.key === NodeInputKeyEnum.aiModel);
            onChangeNode([
              {
                nodeId,
                type: 'updateInput',
                key: NodeInputKeyEnum.aiModelId,
                value: { ...modelIdInput, value: modelId }
              },
              ...(legacyInput
                ? [
                    {
                      nodeId,
                      type: 'delInput' as const,
                      key: NodeInputKeyEnum.aiModel
                    }
                  ]
                : [])
            ]);
          } else {
            const legacyInput = inputs.find((input) => input.key === NodeInputKeyEnum.aiModel);
            if (legacyInput) {
              onChangeNode({
                nodeId,
                type: 'replaceInput',
                key: NodeInputKeyEnum.aiModel,
                value: { ...legacyInput, key: NodeInputKeyEnum.aiModelId, value: modelId }
              });
            } else {
              onChangeNode({
                nodeId,
                type: 'addInput',
                value: { ...Input_Template_SettingAiModel, value: modelId }
              });
            }
          }
          continue;
        }

        const input = inputs.find((input) => input.key === key);
        if (input) {
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key,
            value: {
              ...input,
              // @ts-ignore
              value: e[key]
            }
          });
        }
      }
    },
    [inputs, nodeId, onChangeNode, setDefaultModel]
  );

  const model = useMemoEnhance(() => {
    const aiModelInput =
      inputs.find((input) => input.key === NodeInputKeyEnum.aiModelId) ||
      inputs.find((input) => input.key === NodeInputKeyEnum.aiModel);
    return aiModelInput?.value as string | undefined;
  }, [inputs]);

  const llmModelData: SettingAIDataType = useMemoEnhance(
    () => ({
      modelId: model,
      maxToken: inputs.find((input) => input.key === NodeInputKeyEnum.aiChatMaxToken)?.value,
      temperature: inputs.find((input) => input.key === NodeInputKeyEnum.aiChatTemperature)?.value,
      isResponseAnswerText: inputs.find(
        (input) => input.key === NodeInputKeyEnum.aiChatIsResponseText
      )?.value,
      aiChatVision:
        inputs.find((input) => input.key === NodeInputKeyEnum.aiChatVision)?.value ?? true,
      aiChatAudio:
        inputs.find((input) => input.key === NodeInputKeyEnum.aiChatAudio)?.value ?? false,
      aiChatVideo:
        inputs.find((input) => input.key === NodeInputKeyEnum.aiChatVideo)?.value ?? false,
      aiChatExtractFiles:
        inputs.find((input) => input.key === NodeInputKeyEnum.aiChatExtractFiles)?.value ?? true,
      aiChatReasoning:
        inputs.find((input) => input.key === NodeInputKeyEnum.aiChatReasoning)?.value ?? true,
      aiChatReasoningEffort: inputs.find(
        (input) => input.key === NodeInputKeyEnum.aiChatReasoningEffort
      )?.value,
      aiChatTopP: inputs.find((input) => input.key === NodeInputKeyEnum.aiChatTopP)?.value,
      aiChatStopSign: inputs.find((input) => input.key === NodeInputKeyEnum.aiChatStopSign)?.value,
      aiChatResponseFormat: inputs.find(
        (input) => input.key === NodeInputKeyEnum.aiChatResponseFormat
      )?.value,
      aiChatJsonSchema: inputs.find((input) => input.key === NodeInputKeyEnum.aiChatJsonSchema)
        ?.value
    }),
    [inputs, model]
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
