import type { AppSimpleEditFormType } from '../app/type';
import { FlowNodeTypeEnum } from '../module/node/constant';
import { ModuleOutputKeyEnum, ModuleInputKeyEnum } from '../module/constants';
import type { FlowNodeInputItemType } from '../module/node/type.d';
import { getGuideModule, splitGuideModule } from '../module/utils';
import { ModuleItemType } from '../module/type.d';
import { DatasetSearchModeEnum } from '../dataset/constants';

export const getDefaultAppForm = (): AppSimpleEditFormType => {
  return {
    aiSettings: {
      model: 'gpt-3.5-turbo',
      systemPrompt: '',
      temperature: 0,
      isResponseAnswerText: true,
      quotePrompt: '',
      quoteTemplate: '',
      maxToken: 4000
    },
    dataset: {
      datasets: [],
      similarity: 0.4,
      limit: 1500,
      searchEmptyText: '',
      searchMode: DatasetSearchModeEnum.embedding,
      usingReRank: false,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionBg: ''
    },
    userGuide: {
      welcomeText: '',
      variables: [],
      questionGuide: false,
      tts: {
        type: 'web'
      }
    }
  };
};

/* format app modules to edit form */
export const appModules2Form = ({ modules }: { modules: ModuleItemType[] }) => {
  const defaultAppForm = getDefaultAppForm();

  const findInputValueByKey = (inputs: FlowNodeInputItemType[], key: string) => {
    return inputs.find((item) => item.key === key)?.value;
  };

  modules.forEach((module) => {
    if (module.flowType === FlowNodeTypeEnum.chatNode) {
      defaultAppForm.aiSettings.model = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.aiModel
      );
      defaultAppForm.aiSettings.systemPrompt = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.aiSystemPrompt
      );
      defaultAppForm.aiSettings.temperature = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.aiChatTemperature
      );
      defaultAppForm.aiSettings.maxToken = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.aiChatMaxToken
      );
      defaultAppForm.aiSettings.quoteTemplate = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.aiChatQuoteTemplate
      );
      defaultAppForm.aiSettings.quotePrompt = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.aiChatQuotePrompt
      );
    } else if (module.flowType === FlowNodeTypeEnum.datasetSearchNode) {
      defaultAppForm.dataset.datasets = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.datasetSelectList
      );
      defaultAppForm.dataset.similarity = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.datasetSimilarity
      );
      defaultAppForm.dataset.limit = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.datasetMaxTokens
      );
      defaultAppForm.dataset.searchMode =
        findInputValueByKey(module.inputs, ModuleInputKeyEnum.datasetSearchMode) ||
        DatasetSearchModeEnum.embedding;
      defaultAppForm.dataset.usingReRank = !!findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.datasetSearchUsingReRank
      );
      defaultAppForm.dataset.datasetSearchUsingExtensionQuery = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.datasetSearchUsingExtensionQuery
      );
      defaultAppForm.dataset.datasetSearchExtensionModel = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.datasetSearchExtensionModel
      );
      defaultAppForm.dataset.datasetSearchExtensionBg = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.datasetSearchExtensionBg
      );

      // empty text
      const emptyOutputs =
        module.outputs.find((item) => item.key === ModuleOutputKeyEnum.datasetIsEmpty)?.targets ||
        [];
      const emptyOutput = emptyOutputs[0];
      if (emptyOutput) {
        const target = modules.find((item) => item.moduleId === emptyOutput.moduleId);
        defaultAppForm.dataset.searchEmptyText =
          target?.inputs?.find((item) => item.key === ModuleInputKeyEnum.answerText)?.value || '';
      }
    } else if (module.flowType === FlowNodeTypeEnum.userGuide) {
      const { welcomeText, variableModules, questionGuide, ttsConfig } = splitGuideModule(
        getGuideModule(modules)
      );
      defaultAppForm.userGuide = {
        welcomeText: welcomeText,
        variables: variableModules,
        questionGuide: questionGuide,
        tts: ttsConfig
      };
    }
  });

  return defaultAppForm;
};
