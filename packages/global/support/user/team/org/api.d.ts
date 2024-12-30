export type postCreateOrgData = {
  name: string;
  parentId: string;
  description?: string;
  avatar?: string;
};

export type putUpdateOrgMembersData = {
  orgId: string;
  members: {
    tmbId: string;
    // role: `${OrgMemberRole}`;
  }[];
};

export type putUpdateOrgData = {
  orgId: string;
  name?: string;
  avatar?: string;
  description?: string;
};

export type putMoveOrgType = {
  orgId: string;
  targetOrgId: string;
};

// type putChnageOrgOwnerData = {
//   orgId: string;
//   tmbId: string;
//   toAdmin?: boolean;
// };
