import type { AppSimpleEditFormType } from '../app/type';
import { FlowNodeTypeEnum } from '../module/node/constant';
import {
  ModuleOutputKeyEnum,
  ModuleInputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../module/constants';
import type { FlowNodeInputItemType } from '../module/node/type.d';
import { getGuideModule, splitGuideModule } from '../module/utils';
import { ModuleItemType } from '../module/type.d';
import { DatasetSearchModeEnum } from '../dataset/constants';
import { defaultWhisperConfig } from './constants';

export const getDefaultAppForm = (): AppSimpleEditFormType => {
  return {
    aiSettings: {
      model: 'gpt-3.5-turbo',
      systemPrompt: '',
      temperature: 0,
      isResponseAnswerText: true,
      maxHistories: 6,
      maxToken: 4000
    },
    dataset: {
      datasets: [],
      similarity: 0.4,
      limit: 1500,
      searchMode: DatasetSearchModeEnum.embedding,
      usingReRank: false,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionBg: ''
    },
    selectedTools: [],
    userGuide: {
      welcomeText: '',
      variables: [],
      questionGuide: false,
      tts: {
        type: 'web'
      },
      whisper: defaultWhisperConfig
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
    if (
      module.flowType === FlowNodeTypeEnum.chatNode ||
      module.flowType === FlowNodeTypeEnum.tools
    ) {
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
      defaultAppForm.aiSettings.maxHistories = findInputValueByKey(
        module.inputs,
        ModuleInputKeyEnum.history
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
    } else if (module.flowType === FlowNodeTypeEnum.userGuide) {
      const { welcomeText, variableModules, questionGuide, ttsConfig, whisperConfig } =
        splitGuideModule(getGuideModule(modules));

      defaultAppForm.userGuide = {
        welcomeText: welcomeText,
        variables: variableModules,
        questionGuide: questionGuide,
        tts: ttsConfig,
        whisper: whisperConfig
      };
    } else if (module.flowType === FlowNodeTypeEnum.pluginModule) {
      defaultAppForm.selectedTools.push({
        id: module.inputs.find((input) => input.key === ModuleInputKeyEnum.pluginId)?.value || '',
        name: module.name,
        avatar: module.avatar,
        intro: module.intro || '',
        flowType: module.flowType,
        showStatus: module.showStatus,
        inputs: module.inputs,
        outputs: module.outputs,
        templateType: FlowNodeTemplateTypeEnum.other
      });
    }
  });

  return defaultAppForm;
};
