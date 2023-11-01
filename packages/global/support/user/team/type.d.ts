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
  teamId: string;
  userId: string;
  createTime: Date;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
  defaultTeam: boolean;
};

export type TeamItemType = {
  teamId: string;
  teamName: string;
  avatar: string;
  balance: number;
  teamMemberId: string;
  defaultTeam: boolean;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
};

export type TeamMemberItemType = {
  userId: string;
  teamMemberId: string;
  teamId: string;
  memberUsername: string;
  avatar: string;
  role: `${TeamMemberRoleEnum}`;
  status: `${TeamMemberStatusEnum}`;
};
