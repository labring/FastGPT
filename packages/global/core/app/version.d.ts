import { TeamMemberStatusEnum } from 'support/user/team/constant';
import { StoreEdgeItemType } from '../workflow/type/edge';
import type { AppSchemaType } from './type';
import { AppChatConfigType } from './type';
import type { SourceMemberType } from 'support/user/type';

export type AppVersionSchemaType = {
  _id: string;
  appId: string;
  time: Date;
  nodes: AppSchemaType['modules'];
  edges: AppSchemaType['edges'];
  chatConfig: AppSchemaType['chatConfig'];
  isPublish?: boolean;
  isAutoSave?: boolean;
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
