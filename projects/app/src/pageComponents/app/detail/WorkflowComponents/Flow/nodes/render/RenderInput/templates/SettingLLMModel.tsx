import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type.d';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';

const SelectAiModelRender = ({ item, inputs = [], nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const onChangeModel = useCallback(
    (e: SettingAIDataType) => {
      for (const key in e) {
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
    [inputs, nodeId, onChangeNode]
  );

  const llmModelData: SettingAIDataType = useMemo(
    () => ({
      model: inputs.find((input) => input.key === NodeInputKeyEnum.aiModel)?.value ?? '',
      maxToken: inputs.find((input) => input.key === NodeInputKeyEnum.aiChatMaxToken)?.value,
      temperature: inputs.find((input) => input.key === NodeInputKeyEnum.aiChatTemperature)?.value,
      isResponseAnswerText: inputs.find(
        (input) => input.key === NodeInputKeyEnum.aiChatIsResponseText
      )?.value,
      aiChatVision:
        inputs.find((input) => input.key === NodeInputKeyEnum.aiChatVision)?.value ?? true,
      aiChatReasoning:
        inputs.find((input) => input.key === NodeInputKeyEnum.aiChatReasoning)?.value ?? true,
      aiChatTopP: inputs.find((input) => input.key === NodeInputKeyEnum.aiChatTopP)?.value,
      aiChatStopSign: inputs.find((input) => input.key === NodeInputKeyEnum.aiChatStopSign)?.value,
      aiChatResponseFormat: inputs.find(
        (input) => input.key === NodeInputKeyEnum.aiChatResponseFormat
      )?.value,
      aiChatJsonSchema: inputs.find((input) => input.key === NodeInputKeyEnum.aiChatJsonSchema)
        ?.value
    }),
    [inputs]
  );

  const Render = useMemo(() => {
    return (
      <SettingLLMModel
        llmModelType={item.llmModelType}
        defaultData={llmModelData}
        onChange={onChangeModel}
      />
    );
  }, [item.llmModelType, llmModelData, onChangeModel]);

  return Render;
};

export default React.memo(SelectAiModelRender);
