import type { HelperBotDispatchParamsType, HelperBotDispatchResponseType } from '../type';

export const dispatchSkillEditor = async (
  props: HelperBotDispatchParamsType
): Promise<HelperBotDispatchResponseType> => {
  console.log(props, 22222);
  return {
    aiResponse: [],
    usage: {
      model: '',
      inputTokens: 0,
      outputTokens: 0
    }
  };
};
