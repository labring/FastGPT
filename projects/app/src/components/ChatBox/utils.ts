import { SystemInputEnum } from '@/constants/app';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { chatModelList } from '@/web/common/store/static';
import { AppModuleItemType, VariableItemType } from '@/types/app';

export const getGuideModule = (modules: AppModuleItemType[]) =>
  modules.find((item) => item.flowType === FlowModuleTypeEnum.userGuide);

export const splitGuideModule = (guideModules?: AppModuleItemType) => {
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
export const getChatModelNameList = (modules: AppModuleItemType[]): string[] => {
  const chatModules = modules.filter((item) => item.flowType === FlowModuleTypeEnum.chatNode);
  return chatModules
    .map((item) => {
      const model = item.inputs.find((input) => input.key === 'model')?.value;
      return chatModelList.find((item) => item.model === model)?.name || '';
    })
    .filter((item) => item);
};
