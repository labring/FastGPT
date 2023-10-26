import { SystemInputEnum } from '@/constants/app';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/module/node/constant';
import { VariableItemType } from '@/types/app';
import type { ModuleItemType } from '@fastgpt/global/core/module/type';

export const getGuideModule = (modules: ModuleItemType[]) =>
  modules.find((item) => item.flowType === FlowNodeTypeEnum.userGuide);

export const splitGuideModule = (guideModules?: ModuleItemType) => {
  const welcomeText: string =
    guideModules?.inputs?.find((item) => item.key === SystemInputEnum.welcomeText)?.value || '';

  const variableModules: VariableItemType[] =
    guideModules?.inputs.find((item) => item.key === SystemInputEnum.variables)?.value || [];

  const questionGuide: boolean =
    guideModules?.inputs?.find((item) => item.key === SystemInputEnum.questionGuide)?.value ||
    false;

  return {
    welcomeText,
    variableModules,
    questionGuide
  };
};
