import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { AppTTSConfigType, VariableItemType } from '@/types/app';
import type { ModuleItemType } from '@fastgpt/global/core/module/type';

export const getGuideModule = (modules: ModuleItemType[]) =>
  modules.find((item) => item.flowType === FlowNodeTypeEnum.userGuide);

export const splitGuideModule = (guideModules?: ModuleItemType) => {
  const welcomeText: string =
    guideModules?.inputs?.find((item) => item.key === ModuleInputKeyEnum.welcomeText)?.value || '';

  const variableModules: VariableItemType[] =
    guideModules?.inputs.find((item) => item.key === ModuleInputKeyEnum.variables)?.value || [];

  const questionGuide: boolean =
    guideModules?.inputs?.find((item) => item.key === ModuleInputKeyEnum.questionGuide)?.value ||
    false;

  const ttsConfig: AppTTSConfigType = guideModules?.inputs?.find(
    (item) => item.key === ModuleInputKeyEnum.tts
  )?.value || { type: 'web' };

  return {
    welcomeText,
    variableModules,
    questionGuide,
    ttsConfig
  };
};
