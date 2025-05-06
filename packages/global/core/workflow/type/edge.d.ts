import type { RuntimeEdgeStatusEnum } from '../constants';

export type StoreEdgeItemType = {
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
};

export type RuntimeEdgeItemType = StoreEdgeItemType & {
  status: `${RuntimeEdgeStatusEnum}`;
};
