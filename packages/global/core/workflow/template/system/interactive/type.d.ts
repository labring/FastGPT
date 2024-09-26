import { NodeOutputItemType } from '../../../../chat/type';
import { FlowNodeOutputItemType } from '../../../type/io';
import { RuntimeEdgeItemType } from '../../../runtime/type';
import { FlowNodeInputTypeEnum } from 'core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from 'core/workflow/constants';

export type UserSelectOptionItemType = {
  key: string;
  value: string;
};

export type UserInputFormItemType = {
  type: FlowNodeInputTypeEnum;
  key: string;
  label: string;
  value: any;
  valueType: WorkflowIOValueTypeEnum;
  description?: string;
  defaultValue?: any;
  required: boolean;

  // input & textarea
  maxLength?: number;
  // numberInput
  max?: number;
  min?: number;
  // select
  list?: { label: string; value: string }[];
};

type InteractiveBasicType = {
  entryNodeIds: string[];
  memoryEdges: RuntimeEdgeItemType[];
  nodeOutputs: NodeOutputItemType[];
};

type UserSelectInteractive = {
  type: 'userSelect';
  params: {
    description: string;
    userSelectOptions: UserSelectOptionItemType[];
    userSelectedVal?: string;
  };
};

type UserInputInteractive = {
  type: 'userInput';
  params: {
    description: string;
    inputForm: UserInputFormItemType[];
    submitted?: boolean;
  };
};

export type InteractiveNodeResponseItemType = InteractiveBasicType &
  (UserSelectInteractive | UserInputInteractive);
