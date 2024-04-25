/* 
  react flow type
*/
import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from './constant';
import { WorkflowIOValueTypeEnum, NodeInputKeyEnum, NodeOutputKeyEnum } from '../constants';
import { SelectedDatasetType } from '../api';
import { LLMModelTypeEnum } from '../../ai/constants';

/* --------------- edit field ------------------- */
export type EditInputFieldMapType = EditOutputFieldMapType & {
  inputType?: boolean;
};
export type EditOutputFieldMapType = {
  key?: boolean;
  description?: boolean;
  valueType?: boolean; // output
  required?: boolean;
  defaultValue?: boolean;
};
export type EditNodeFieldType = {
  inputType?: FlowNodeInputTypeEnum; // input type
  valueType?: WorkflowIOValueTypeEnum;
  required?: boolean;
  key?: string;
  label?: string;
  description?: string;
  isToolInput?: boolean;

  defaultValue?: string;
  maxLength?: number;
  max?: number;
  min?: number;
  editField?: EditInputFieldMapType;
  dynamicParamDefaultValue?: {
    inputType?: FlowNodeInputTypeEnum; // input type
    valueType?: WorkflowIOValueTypeEnum;
    required?: boolean;
  };
};
