import type { EmbeddingModelItemType, LLMModelItemType } from '../../ai/model.d';
import type { LLMModelTypeEnum } from '../../ai/constants';
import type { WorkflowIOValueTypeEnum, NodeInputKeyEnum, NodeOutputKeyEnum } from '../constants';
import type { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum } from '../node/constant';
import type { SecretValueType } from '../../../common/secret/type';

// Dynamic input field configuration
export type CustomFieldConfigType = {
  // selectInputTypeList: FlowNodeInputTypeEnum[]; // 可以选哪些输入类型, 只有1个话,则默认选择

  // reference
  selectValueTypeList?: WorkflowIOValueTypeEnum[]; // 可以选哪个数据类型, 只有1个的话,则默认选择

  showDefaultValue?: boolean;
  showDescription?: boolean;
};
export type InputComponentPropsType = {
  referencePlaceholder?: string;
  placeholder?: string; // input,textarea
  maxLength?: number; // input,textarea

  list?: { label: string; value: string }[]; // select

  markList?: { label: string; value: number }[]; // slider
  step?: number; // slider
  max?: number; // slider, number input
  min?: number; // slider, number input
  precision?: number; // number input

  defaultValue?: string;

  llmModelType?: `${LLMModelTypeEnum}`;

  // dynamic input
  customInputConfig?: CustomFieldConfigType;
};
export type InputConfigType = {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  inputType: 'input' | 'numberInput' | 'secret' | 'switch' | 'select';
  value?: SecretValueType;

  // Selector
  list?: { label: string; value: string }[];
};

export type FlowNodeInputItemType = InputComponentPropsType & {
  selectedTypeIndex?: number;
  renderTypeList: FlowNodeInputTypeEnum[]; // Node Type. Decide on a render style

  key: `${NodeInputKeyEnum}` | string;
  valueType?: WorkflowIOValueTypeEnum; // data type
  valueDesc?: string; // data desc
  value?: any;
  label: string;
  debugLabel?: string;
  description?: string; // field desc
  required?: boolean;
  enum?: string;

  inputList?: InputConfigType[]; // when key === 'system_input_config', this field is used

  toolDescription?: string; // If this field is not empty, it is entered as a tool

  // render components params
  canEdit?: boolean; // dynamic inputs
  isPro?: boolean; // Pro version field
  isToolOutput?: boolean;

  // file
  canSelectFile?: boolean;
  canSelectImg?: boolean;
  maxFiles?: number;

  deprecated?: boolean;
};

export type FlowNodeOutputItemType = {
  id: string; // output unique id(Does not follow the key change)
  type: FlowNodeOutputTypeEnum;
  key: `${NodeOutputKeyEnum}` | string;
  valueType?: WorkflowIOValueTypeEnum;
  valueDesc?: string;
  value?: any;

  label?: string;
  description?: string;
  defaultValue?: any;
  required?: boolean;

  invalid?: boolean;
  invalidCondition?: (e: {
    inputs: FlowNodeInputItemType[];
    llmModelList: LLMModelItemType[];
  }) => boolean;

  // component params
  customFieldConfig?: CustomFieldConfigType;

  deprecated?: boolean;
};

// Field value type
export type ReferenceItemValueType = [string, string | undefined];
export type ReferenceArrayValueType = ReferenceItemValueType[];
export type ReferenceValueType = ReferenceItemValueType | ReferenceArrayValueType;

export type SelectedDatasetType = {
  datasetId: string;
  avatar: string;
  name: string;
  vectorModel: EmbeddingModelItemType;
}[];

/* http node */
export type HttpParamAndHeaderItemType = {
  key: string;
  type: string;
  value: string;
};
