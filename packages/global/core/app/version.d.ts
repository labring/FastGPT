import { StoreNodeItemType } from '../workflow/type';
import { StoreEdgeItemType } from '../workflow/type/edge';

export type AppVersionSchemaType = {
  _id: string;
  appId: string;
  time: Date;
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
};
