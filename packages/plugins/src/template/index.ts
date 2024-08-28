import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

type Props = {
  text: string;
};

// Response type same as HTTP outputs
type Response = Promise<{
  [NodeInputKeyEnum.answerText]: string;
  responseText: string;
}>;

const main = async ({ text }: Props): Response => {
  return {
    // This output object needs to correspond to the content of the plug-in output
    [NodeInputKeyEnum.answerText]: 'AnswerText', //  This is a special field, and returning this field will return a message to the client
    responseText: `text: ${text}`
  };
};

export default main;
