import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

export type ToolNodeItemType = RuntimeNodeItemType & {
  toolParams: RuntimeNodeItemType['inputs'];
  jsonSchema?: JSONSchemaInputType;
};

export type DispatchSubAppProps<T> = {
  messages: ChatCompletionMessageParam[];
  onStream?: (e: { text: string }) => void;
  params: T;
};
export type DispatchSubAppResponse = {
  response: string;
  usages?: ChatNodeUsageType[];
};
