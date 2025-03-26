export type postCreateOrgData = {
  name: string;
  description?: string;
  avatar?: string;
  orgId?: string;
};

export type putUpdateOrgMembersData = {
  orgId?: string;
  members: {
    tmbId: string;
    // role: `${OrgMemberRole}`;
  }[];
};

export type putUpdateOrgData = {
  orgId: string; // can not be undefined because can not uppdate root org
  name?: string;
  avatar?: string;
  description?: string;
};

export type putMoveOrgType = {
  orgId: string;
  targetOrgId?: string; // '' ===> move to root org
};

// type putChnageOrgOwnerData = {
//   orgId: string;
//   tmbId: string;
//   toAdmin?: boolean;
// };
