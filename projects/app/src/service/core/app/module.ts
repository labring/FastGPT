import { FlowModuleTypeEnum } from '@/constants/flow';
import { AppModuleItemType } from '@/types/app';

export const getChatModelNameListByModules = (modules: AppModuleItemType[]): string[] => {
  const chatModules = modules.filter((item) => item.flowType === FlowModuleTypeEnum.chatNode);
  return chatModules
    .map((item) => {
      const model = item.inputs.find((input) => input.key === 'model')?.value;
      return global.chatModels.find((item) => item.model === model)?.name || '';
    })
    .filter((item) => item);
};
