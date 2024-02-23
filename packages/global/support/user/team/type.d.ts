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
  limit: {
    lastExportDatasetTime: Date;
    lastWebsiteSyncTime: Date;
  };
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

export type TeamMemberWithUserSchema = TeamMemberSchema & {
  userId: UserModelSchema;
};
export type TeamMemberWithTeamSchema = TeamMemberSchema & {
  teamId: TeamSchema;
};
export type TeamMemberWithTeamAndUserSchema = TeamMemberWithTeamSchema & {
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
