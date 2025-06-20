import type { LLMModelItemType } from '../../ai/model.d';
import type { LLMModelTypeEnum } from '../../ai/constants';
import type { WorkflowIOValueTypeEnum, NodeInputKeyEnum, NodeOutputKeyEnum } from '../constants';
import type { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum } from '../node/constant';

// Dynamic input field configuration
export type CustomFieldConfigType = {
  // selectInputTypeList: FlowNodeInputTypeEnum[]; // 可以选哪些输入类型, 只有1个话,则默认选择

  // reference
  selectValueTypeList?: WorkflowIOValueTypeEnum[]; // 可以选哪个数据类型, 只有1个的话,则默认选择

  // showIsToolParam?: boolean; // 是否作为工具参数

  // showRequired?: boolean;
  // defaultRequired?: boolean;

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

  defaultValue?: string;

  llmModelType?: `${LLMModelTypeEnum}`;

  // dynamic input
  customInputConfig?: CustomFieldConfigType;
};
export type InputConfigType = Omit<InputType, 'renderTypeList' | 'inputList'>;

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

export type ReferenceItemValueType = [string, string | undefined];
export type ReferenceArrayValueType = ReferenceItemValueType[];
export type ReferenceValueType = ReferenceItemValueType | ReferenceArrayValueType;
