import { OrgMemberRole } from './constant';

type postCreateOrgData = {
  name: string;
  parentId: string;
  avatar?: string;
};

type putUpdateOrgMembersData = {
  orgId: string;
  members: {
    tmbId: string;
    role: `${OrgMemberRole}`;
  }[];
};

type putChnageOrgOwnerData = {
  orgId: string;
  tmbId: string;
  toAdmin?: boolean;
};

type putUpdateOrgData = {
  orgId: string;
  name?: string;
  avatar?: string;
  parentId?: string;
};
