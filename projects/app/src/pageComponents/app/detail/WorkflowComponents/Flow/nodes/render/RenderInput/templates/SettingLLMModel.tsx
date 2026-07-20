import React, { useCallback } from 'react';
import type { RenderInputProps } from '../type';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useLocalStorageState } from 'ahooks';

const SelectAiModelRender = ({ inputs = [], nodeId, settingLLMModelProps }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  // Keep the shared cache fresh with the last chosen chat model; it no longer
  // pre-fills this node (design §3.2). CommonInputForm's selectLLMModel input
  // fallback reads it.
  const [, setDefaultModel] = useLocalStorageState<string>('workflow_default_llm_model', {
    defaultValue: ''
  });

  const onChangeModel = useCallback(
    (e: SettingAIDataType) => {
      for (const key in e) {
        // SettingAIDataType.modelId maps to NodeInputKeyEnum.aiModelId in workflow inputs
        if (key === 'modelId') {
          setDefaultModel(e[key]);
        }

        const inputKey = key === 'modelId' ? NodeInputKeyEnum.aiModelId : key;
        const input = inputs.find((input) => input.key === inputKey);
        if (input) {
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key: inputKey,
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

  const { model } = useMemoEnhance(() => {
    const aiModelInput = inputs.find((input) => input.key === NodeInputKeyEnum.aiModelId);
    const inputModel = aiModelInput?.value as string | undefined;

    return {
      // Keep the node value as-is: when empty, stay empty so the selector's
      // autoSelectDefault fills the system default (design §3.2), not list[0].
      model: inputModel ?? ''
    };
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
