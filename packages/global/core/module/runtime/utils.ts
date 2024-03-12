import { ChatCompletionRequestMessageRoleEnum } from '../../ai/constants';

export const textAdaptGptResponse = ({
  text,
  model = '',
  finish_reason = null,
  extraData = {}
}: {
  model?: string;
  text: string | null;
  finish_reason?: null | 'stop';
  extraData?: Object;
}) => {
  return JSON.stringify({
    ...extraData,
    id: '',
    object: '',
    created: 0,
    model,
    choices: [
      {
        delta:
          text === null
            ? {}
            : { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: text },
        index: 0,
        finish_reason
      }
    ]
  });
};
