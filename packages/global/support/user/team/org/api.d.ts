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

export type putMoveOrgData = {
  orgId: string;
  parentId: string;
};

export type putMoveOrgMemberData = {
  orgId: string;
  tmbId: string;
  newOrgId: string;
};

// type putChnageOrgOwnerData = {
//   orgId: string;
//   tmbId: string;
//   toAdmin?: boolean;
// };
