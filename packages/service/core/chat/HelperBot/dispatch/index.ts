import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';
import { dispatchTopAgent } from './topAgent';
import { dispatchSkillEditor } from './skillEditor';

export const dispatchMap = {
  [HelperBotTypeEnum.topAgent]: dispatchTopAgent,
  [HelperBotTypeEnum.skillEditor]: dispatchSkillEditor
};
