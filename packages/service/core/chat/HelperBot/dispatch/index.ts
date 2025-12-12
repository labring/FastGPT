import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import { dispatchTopAgent } from './topAgent';
import { dispatchSkillAgent } from './skillAgent';

export const dispatchMap = {
  [HelperBotTypeEnum.topAgent]: dispatchTopAgent,
  [HelperBotTypeEnum.skillAgent]: dispatchSkillAgent
};
