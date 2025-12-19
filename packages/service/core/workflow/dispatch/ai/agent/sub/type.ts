import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import type { SystemToolSecretInputTypeEnum } from '@fastgpt/global/core/app/tool/systemTool/constants';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { NodeToolConfigTypeSchema } from '@fastgpt/global/core/workflow/type/node';

export type SubAppInitType = {
  id: string;
  name: string;
  version?: string;
  toolConfig?: RuntimeNodeItemType['toolConfig'];
  requestSchema: ChatCompletionTool;
  params: {
    [NodeInputKeyEnum.systemInputConfig]?: {
      type: SystemToolSecretInputTypeEnum;
      value: StoreSecretValueType;
    };
    [key: string]: any;
  };
};
