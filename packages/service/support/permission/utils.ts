import type { CollaboratorIdType } from '@fastgpt/global/support/permission/collaborator';

export const pickCollaboratorIdFields = (clb: CollaboratorIdType) => {
  return {
    ...(clb.tmbId && { tmbId: clb.tmbId }),
    ...(clb.groupId && { groupId: clb.groupId }),
    ...(clb.orgId && { orgId: clb.orgId })
  };
};
