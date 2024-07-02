import { SystemPluginResponseType } from '../../type';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

type Props = {
  text: string;
};

const main = async ({ text }: Props): SystemPluginResponseType => {
  return {
    formatResponse: {
      // This output object needs to correspond to the content of the plug-in output
      [NodeInputKeyEnum.answerText]: 'AnswerText', //  This is a special field, and returning this field will return a message to the client
      responseText: `text: ${text}`
    },
    rawResponse: `This is a raw response, Commonly used for tool calls`
  };
};

export default main;
