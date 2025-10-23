import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';

export type ToolNodeItemType = RuntimeNodeItemType & {
  toolParams: RuntimeNodeItemType['inputs'];
  jsonSchema?: JSONSchemaInputType;
};

export type DispatchSubAppResponse = {
  response: string;
  usages?: ChatNodeUsageType[];
};

export type GetSubAppInfoFnType = (id: string) => {
  name: string;
  avatar: string;
  toolDescription: string;
};
