import { WorkflowIOValueTypeEnum } from '../workflow/constants';
import { FlowNodeInputTypeEnum } from '../workflow/node/constant';
import type { FlowNodeInputItemType } from '../workflow/type/io';

type SchemaInputValueType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
export type JsonSchemaPropertiesItemType = {
  type: SchemaInputValueType;
  enum?: string[];
  description?: string;
  items?: { type: SchemaInputValueType };
};
export type JSONSchemaInputType = {
  type: SchemaInputValueType;
  properties?: Record<string, JsonSchemaPropertiesItemType>;
  required?: string[];
};

const getNodeInputTypeFromSchemaInputType = ({
  type,
  arrayItems
}: {
  type: SchemaInputValueType;
  arrayItems?: { type: SchemaInputValueType };
}) => {
  if (type === 'string') return WorkflowIOValueTypeEnum.string;
  if (type === 'number') return WorkflowIOValueTypeEnum.number;
  if (type === 'integer') return WorkflowIOValueTypeEnum.number;
  if (type === 'boolean') return WorkflowIOValueTypeEnum.boolean;
  if (type === 'object') return WorkflowIOValueTypeEnum.object;

  if (!arrayItems) return WorkflowIOValueTypeEnum.arrayAny;

  const itemType = arrayItems.type;
  if (itemType === 'string') return WorkflowIOValueTypeEnum.string;
  if (itemType === 'number') return WorkflowIOValueTypeEnum.number;
  if (itemType === 'integer') return WorkflowIOValueTypeEnum.number;
  if (itemType === 'boolean') return WorkflowIOValueTypeEnum.boolean;
  if (itemType === 'object') return WorkflowIOValueTypeEnum.object;

  return WorkflowIOValueTypeEnum.arrayAny;
};
const getNodeInputRenderTypeFromSchemaInputType = ({
  type,
  enum: enumList
}: JsonSchemaPropertiesItemType) => {
  if (enumList && enumList.length > 0) {
    return {
      value: enumList[0],
      renderTypeList: [FlowNodeInputTypeEnum.select],
      enum: enumList.join('\n')
    };
  }
  if (type === 'string') {
    return {
      renderTypeList: [FlowNodeInputTypeEnum.input]
    };
  }
  if (type === 'number') {
    return {
      renderTypeList: [FlowNodeInputTypeEnum.numberInput]
    };
  }
  if (type === 'boolean') {
    return {
      renderTypeList: [FlowNodeInputTypeEnum.switch]
    };
  }
  return { renderTypeList: [FlowNodeInputTypeEnum.JSONEditor] };
};
export const jsonSchema2NodeInput = (jsonSchema: JSONSchemaInputType): FlowNodeInputItemType[] => {
  return Object.entries(jsonSchema?.properties || {}).map(([key, value]) => ({
    key,
    label: key,
    valueType: getNodeInputTypeFromSchemaInputType({ type: value.type }), // TODO: 这里需要做一个映射
    description: value.description,
    toolDescription: value.description || key,
    required: jsonSchema?.required?.includes(key),
    ...getNodeInputRenderTypeFromSchemaInputType(value)
  }));
};
