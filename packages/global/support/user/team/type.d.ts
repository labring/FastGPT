import type { UserModelSchema } from '../type';
import type { TeamMemberRoleEnum, TeamMemberStatusEnum } from './constant';

export type TeamSchema = {
  _id: string;
  name: string;
  ownerId: string;
  avatar: string;
  createTime: Date;
  balance: number;
  maxSize: number;
  tagsUrl: string;
  limit: {
    lastExportDatasetTime: Date;
    lastWebsiteSyncTime: Date;
  };
};
export type tagsType = {
  label: string,
  key: string
}
export type TeamTagsSchema = {
  _id: string;
  label: string;
  teamId: string;
  key: string;
  createTime: Date;
};

export type TeamMemberSchema = {
  _id: string;
  teamId: string;
  userId: string;
  createTime: Date;
  name: string;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
  defaultTeam: boolean;
};

export type TeamMemberWithUserSchema = Omit<TeamMemberSchema, 'userId'> & {
  userId: UserModelSchema;
};
export type TeamMemberWithTeamSchema = Omit<TeamMemberSchema, 'teamId'> & {
  teamId: TeamSchema;
};
export type TeamMemberWithTeamAndUserSchema = Omit<TeamMemberWithTeamSchema, 'userId'> & {
  userId: UserModelSchema;
};

export type TeamItemType = {
  userId: string;
  teamId: string;
  teamName: string;
  memberName: string;
  avatar: string;
  balance: number;
  tmbId: string;
  defaultTeam: boolean;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
  canWrite: boolean;
  maxSize: number;
};

export type TeamMemberItemType = {
  userId: string;
  tmbId: string;
  teamId: string;
  memberName: string;
  avatar: string;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
};
