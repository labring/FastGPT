import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from './constant';
import { ModuleDataTypeEnum, ModuleInputKeyEnum, ModuleOutputKeyEnum } from '../constants';
import { SelectedDatasetType } from '../api';

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
  key: `${ModuleInputKeyEnum}` | string;
  type: `${FlowNodeInputTypeEnum}`; // Decide on a render style
  value?: any;
  valueType?: `${ModuleDataTypeEnum}`; // data type
  label: string;
  description?: string;
  required?: boolean;
  edit?: boolean; // Whether to allow editing
  connected?: boolean; // unConnected field will be deleted

  showTargetInApp?: boolean;
  showTargetInPlugin?: boolean;

  placeholder?: string; // input,textarea
  list?: { label: string; value: any }[]; // select
  step?: number; // slider max?: number;
  max?: number;
  min?: number;
  markList?: { label: string; value: any }[]; // slider

  plusField?: boolean; // plus system will show
};

export type FlowNodeOutputTargetItemType = {
  moduleId: string;
  key: string;
};
export type FlowNodeOutputItemType = {
  key: `${ModuleOutputKeyEnum}` | string;
  label?: string;
  edit?: boolean;
  description?: string;
  valueType?: `${ModuleDataTypeEnum}`;
  type?: `${FlowNodeOutputTypeEnum}`;
  targets: FlowNodeOutputTargetItemType[];
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
  [ModuleInputKeyEnum.datasetLimit]: number;
  [ModuleInputKeyEnum.datasetStartReRank]: boolean;
};
