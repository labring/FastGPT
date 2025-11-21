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
  key: `${NodeInputKeyEnum}` | string;
  label: string;

  valueType?: WorkflowIOValueTypeEnum; // data type
  required?: boolean;
  defaultValue?: any;

  referencePlaceholder?: string;
  isRichText?: boolean;
  placeholder?: string; // input,textarea
  maxLength?: number; // input,textarea
  minLength?: number; // password

  list?: { label: string; value: string }[]; // select

  markList?: { label: string; value: number }[]; // slider
  step?: number; // slider
  max?: number; // slider, number input
  min?: number; // slider, number input
  precision?: number; // number input

  llmModelType?: `${LLMModelTypeEnum}`;

  // file
  canSelectFile?: boolean;
  canSelectImg?: boolean;
  canSelectVideo?: boolean;
  canSelectAudio?: boolean;
  canSelectCustomFileExtension?: boolean;
  customFileExtensionList?: string[];
  canLocalUpload?: boolean;
  canUrlUpload?: boolean;
  maxFiles?: number;

  // Time
  timeGranularity?: 'day' | 'hour' | 'minute' | 'second';
  timeRangeStart?: string;
  timeRangeEnd?: string;

  // dataset select
  datasetOptions?: SelectedDatasetType[];

  // dynamic input
  customInputConfig?: CustomFieldConfigType;

  // @deprecated
  enums?: { value: string; label: string }[];
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

  valueDesc?: string; // data desc
  value?: any;
  debugLabel?: string;
  description?: string; // field desc
  toolDescription?: string; // If this field is not empty, it is entered as a tool

  enum?: string;
  inputList?: InputConfigType[]; // when key === 'system_input_config', this field is used

  // render components params
  canEdit?: boolean; // dynamic inputs
  isPro?: boolean; // Pro version field
  isToolOutput?: boolean;

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
};

/* http node */
export type HttpParamAndHeaderItemType = {
  key: string;
  type: string;
  value: string;
};
