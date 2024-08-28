import { FlowNodeInputItemType, FlowNodeOutputItemType } from './io';

export type FlowNodeChangeProps = { nodeId: string } & (
  | {
      type: 'attr'; // key: attr, value: new value
      key: string;
      value: any;
    }
  | {
      type: 'updateInput'; // key: update input key, value: new input value
      key: string;
      value: FlowNodeInputItemType;
    }
  | {
      type: 'replaceInput'; // key: old input key, value: new input value
      key: string;
      value: FlowNodeInputItemType;
    }
  | {
      type: 'addInput'; // key: null, value: new input value
      value: FlowNodeInputItemType;
      index?: number;
    }
  | {
      type: 'delInput'; // key: delete input key, value: null
      key: string;
    }
  | {
      type: 'updateOutput'; // key: update output key, value: new output value
      key: string;
      value: FlowNodeOutputItemType;
    }
  | {
      type: 'replaceOutput'; // key: old output key, value: new output value
      key: string;
      value: FlowNodeOutputItemType;
    }
  | {
      type: 'addOutput'; // key: null, value: new output value
      value: FlowNodeOutputItemType;
      index?: number;
    }
  | {
      type: 'delOutput'; // key: delete output key, value: null
      key: string;
    }
);
