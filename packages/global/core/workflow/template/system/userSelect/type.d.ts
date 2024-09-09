import { NodeOutputItemType } from '../../../../chat/type';
import { FlowNodeOutputItemType } from '../../../type/io';
import { RuntimeEdgeItemType } from '../../../runtime/type';

export type UserSelectOptionItemType = {
  key: string;
  value: string;
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

export type InteractiveNodeResponseItemType = InteractiveBasicType & UserSelectInteractive;
