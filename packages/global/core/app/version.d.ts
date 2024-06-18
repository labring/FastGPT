import { StoreNodeItemType } from '../workflow/type';
import { StoreEdgeItemType } from '../workflow/type/edge';
import { AppChatConfigType, AppSchema } from './type';

export type AppVersionSchemaType = {
  _id: string;
  appId: string;
  time: Date;
  nodes: AppSchema['modules'];
  edges: AppSchema['edges'];
  chatConfig: AppSchema['chatConfig'];
};
