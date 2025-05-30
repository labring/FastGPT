import { TeamMemberStatusEnum } from 'support/user/team/constant';
import type { SourceMemberType } from 'support/user/type';

export type TagSchemaType = {
  _id: string;
  teamId: string;
  name: string;
  color: string;
  createTime: Date;
};

export type TagWithCountType = TagSchemaType & {
  count: number;
};

export type TagListItemType = {
  _id: string;
  teamId: string;
  name: string;
  color: string;
  createTime: Date;
  count?: number;
  sourceMember?: SourceMemberType;
};
