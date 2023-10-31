import { UserModelSchema } from '../type';
import { TeamMemberRoleEnum, TeamMemberStatusEnum } from './constant';

export type TeamSchema = {
  _id: string;
  name: string;
  ownerId: string;
  avatar: string;
  createTime: Date;
  balance: number;
};

export type TeamMemberSchema = {
  _id: string;
  name: string;
  teamId: string;
  userId: string;
  createTime: Date;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
};

export type TeamMemberSchemaWithTeam = TeamMemberSchema & {
  teamId: TeamSchema;
};
export type TeamMemberSchemaWithUser = TeamMemberSchema & {
  userId: UserModelSchema;
};

export type TeamItemType = {
  teamId: string;
  teamName: string;
  avatar: string;
  balance: number;
  teamMemberId: string;
  memberName: string;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
};

export type TeamMemberItemType = {
  userId: string;
  teamMemberId: string;
  teamId: string;
  name: string;
  avatar: string;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
};
