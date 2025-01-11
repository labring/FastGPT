import { TeamMemberStatusEnum } from 'support/user/team/constant';
import { StoreEdgeItemType } from '../workflow/type/edge';
import { AppChatConfigType, AppSchema } from './type';
import { SourceMemberType } from 'support/user/type';

export type AppVersionSchemaType = {
  _id: string;
  appId: string;
  time: Date;
  nodes: AppSchema['modules'];
  edges: AppSchema['edges'];
  chatConfig: AppSchema['chatConfig'];
  isPublish?: boolean;
  versionName: string;
  tmbId: string;
};

export type VersionListItemType = {
  _id: string;
  appId: string;
  versionName: string;
  time: Date;
  isPublish: boolean | undefined;
  tmbId: string;
  sourceMember: SourceMemberType;
};
