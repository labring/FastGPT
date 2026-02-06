import React, { useCallback } from 'react';
import type { RenderInputProps } from '../type';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useLocalStorageState } from 'ahooks';
import { getWebDefaultLLMModel } from '@/web/common/system/utils';

const SelectAiModelRender = ({ item, inputs = [], nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const [defaultModel, setDefaultModel] = useLocalStorageState<string>(
    'workflow_default_llm_model',
    {
      defaultValue: getWebDefaultLLMModel()?.model || ''
    }
  );

  const onChangeModel = useCallback(
    (e: SettingAIDataType) => {
      for (const key in e) {
        if (key === NodeInputKeyEnum.aiModel) {
          setDefaultModel(e[key]);
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

  const llmModelData: SettingAIDataType = useMemoEnhance(
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

  return (
    <SettingLLMModel
      defaultModel={defaultModel}
      llmModelType={item.llmModelType}
      defaultData={llmModelData}
      onChange={onChangeModel}
    />
  );
};

export default React.memo(SelectAiModelRender);
