import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from './constant';
import { ModuleIOValueTypeEnum, ModuleInputKeyEnum, ModuleOutputKeyEnum } from '../constants';
import { SelectedDatasetType } from '../api';
import { EditInputFieldMap, EditOutputFieldMap } from './type';

export type FlowNodeChangeProps = {
  moduleId: string;
  type:
    | 'attr' // key: attr, value: new value
    | 'updateInput' // key: update input key, value: new input value
    | 'replaceInput' // key: old input key, value: new input value
    | 'addInput' // key: null, value: new input value
    | 'delInput' // key: delete input key, value: null
    | 'updateOutput' // key: update output key, value: new output value
    | 'replaceOutput' // key: old output key, value: new output value
    | 'addOutput' // key: null, value: new output value
    | 'delOutput'; // key: delete output key, value: null
  key?: string;
  value?: any;
  index?: number;
};

export type FlowNodeInputItemType = {
  valueType?: `${ModuleIOValueTypeEnum}`; // data type
  type: `${FlowNodeInputTypeEnum}`; // Node Type. Decide on a render style
  key: `${ModuleInputKeyEnum}` | string;
  value?: any;
  label: string;
  description?: string;
  required?: boolean;

  edit?: boolean; // Whether to allow editing
  editField?: EditInputFieldMap;
  defaultEditField?: EditNodeFieldType;

  connected?: boolean; // There are incoming data

  showTargetInApp?: boolean;
  showTargetInPlugin?: boolean;

  hideInApp?: boolean;
  hideInPlugin?: boolean;

  placeholder?: string; // input,textarea

  list?: { label: string; value: any }[]; // select

  markList?: { label: string; value: any }[]; // slider
  step?: number; // slider
  max?: number; // slider, number input
  min?: number; // slider, number input
};

export type FlowNodeOutputTargetItemType = {
  moduleId: string;
  key: string;
};
export type FlowNodeOutputItemType = {
  type?: `${FlowNodeOutputTypeEnum}`;
  key: `${ModuleOutputKeyEnum}` | string;
  valueType?: `${ModuleIOValueTypeEnum}`;

  label?: string;
  description?: string;

  edit?: boolean;
  editField?: EditOutputFieldMap;
  defaultEditField?: EditNodeFieldType;

  targets: FlowNodeOutputTargetItemType[];
};

/* --------------- edit field ------------------- */
export type EditInputFieldMap = EditOutputFieldMap & {
  inputType?: boolean;
  required?: boolean;
};
export type EditOutputFieldMap = {
  name?: boolean;
  key?: boolean;
  description?: boolean;
  dataType?: boolean;
};
export type EditNodeFieldType = {
  inputType?: `${FlowNodeInputTypeEnum}`; // input type
  outputType?: `${FlowNodeOutputTypeEnum}`;
  required?: boolean;
  key?: string;
  label?: string;
  description?: string;
  valueType?: `${ModuleIOValueTypeEnum}`;
};

/* ------------- item type --------------- */
/* ai chat modules props */
export type AIChatModuleProps = {
  [ModuleInputKeyEnum.aiModel]: string;
  [ModuleInputKeyEnum.aiSystemPrompt]?: string;
  [ModuleInputKeyEnum.aiChatTemperature]: number;
  [ModuleInputKeyEnum.aiChatMaxToken]: number;
  [ModuleInputKeyEnum.aiChatIsResponseText]: boolean;
  [ModuleInputKeyEnum.aiChatQuoteTemplate]?: string;
  [ModuleInputKeyEnum.aiChatQuotePrompt]?: string;
};

export type DatasetModuleProps = {
  [ModuleInputKeyEnum.datasetSelectList]: SelectedDatasetType;
  [ModuleInputKeyEnum.datasetSimilarity]: number;
  [ModuleInputKeyEnum.datasetMaxTokens]: number;
  [ModuleInputKeyEnum.datasetStartReRank]: boolean;
};
