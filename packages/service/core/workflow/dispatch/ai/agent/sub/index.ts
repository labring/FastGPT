import type { ChatCompletionTool } from '@fastgpt/global/core/ai/type';
import { readFileTool } from './file/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { JSONSchemaInputType } from '@fastgpt/global/core/app/jsonschema';
import {
  NodeInputKeyEnum,
  toolValueTypeList,
  valueTypeJsonSchemaMap
} from '@fastgpt/global/core/workflow/constants';
import type { McpToolDataType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getSystemToolRunTimeNodeFromSystemToolset } from '../../../../utils';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { MongoApp } from '../../../../../app/schema';
import { getMCPChildren } from '../../../../../app/mcp';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import type { localeType } from '@fastgpt/global/common/i18n/type';
