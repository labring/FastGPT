import { SystemPluginResponseType } from '../../type.d';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

type Props = {
  time: string;
};

const main = async ({ time }: Props): SystemPluginResponseType => {
  return {
    formatResponse: {
      time
    },
    rawResponse: time
  };
};

export default main;
