import React, { useCallback, useEffect } from 'react';
import type { RenderInputProps } from '../type';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type';
import SettingLLMModel from '@/components/core/ai/SettingLLMModel';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useContextSelector } from 'use-context-selector';
import { WorkflowActionsContext } from '@/pageComponents/app/detail/WorkflowComponents/context/workflowActionsContext';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';
import { useLocalStorageState } from 'ahooks';
import { getWebDefaultLLMModel } from '@/web/common/system/utils';
import { useSystemStore } from '@/web/common/system/useSystemStore';

const SelectAiModelRender = ({ inputs = [], nodeId }: RenderInputProps) => {
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);
  const { llmModelList } = useSystemStore();

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

  const { aiModelInput, model } = useMemoEnhance(() => {
    const aiModelInput = inputs.find((input) => input.key === NodeInputKeyEnum.aiModel);
    const inputModel = aiModelInput?.value as string | undefined;
    const modelSet = new Set(llmModelList.map((item) => item.model));
    const defaultLLMModel = getWebDefaultLLMModel(llmModelList)?.model || '';
    const validDefaultModel = defaultModel && modelSet.has(defaultModel) ? defaultModel : '';
    const fallbackModel = validDefaultModel || defaultLLMModel;

    return {
      aiModelInput,
      model: inputModel || fallbackModel
    };
  }, [defaultModel, inputs, llmModelList]);

  /**
   * settingLLMModel 会用本地缓存模型作为选择器展示值。
   * 当节点本身还没有 model 时,需要把这个展示兜底值同步写回节点,
   * 避免后端运行时收到空 model 后回退到系统默认模型。
   */
  useEffect(() => {
    if (!aiModelInput || aiModelInput.value || !model) return;

    setDefaultModel(model);
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: aiModelInput.key,
      value: {
        ...aiModelInput,
        value: model
      }
    });
  }, [aiModelInput, model, nodeId, onChangeNode, setDefaultModel]);

  const llmModelData: SettingAIDataType = useMemoEnhance(
    () => ({
      model,
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

  return <SettingLLMModel defaultData={llmModelData} onChange={onChangeModel} />;
};

export default React.memo(SelectAiModelRender);
