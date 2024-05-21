import { StoreNodeItemType } from '../workflow/type';
import { StoreEdgeItemType } from '../workflow/type/edge';
import { AppChatConfigType } from './type';

export type AppVersionSchemaType = {
  _id: string;
  appId: string;
  time: Date;
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig: AppChatConfigType;
};
