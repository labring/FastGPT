import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';

export type ToolNodeItemType = RuntimeNodeItemType & {
  toolParams: RuntimeNodeItemType['inputs'];
  jsonSchema?: JSONSchemaInputType;
};
