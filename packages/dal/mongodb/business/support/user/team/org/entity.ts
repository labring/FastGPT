import {
  OrgMemberSchema,
  OrgSchema,
  type Org,
  type OrgMember
} from '../../../../../../business/support/user/team/org';
import type { OrgDocument } from './schema';
import type { OrgMemberDocument } from './member/schema';
import { toEntityId } from '../../../../../utils';

export const toOrg = (document: OrgDocument): Org =>
  OrgSchema.parse({
    id: toEntityId(document._id),
    teamId: toEntityId(document.teamId),
    pathId: document.pathId,
    path: document.path,
    name: document.name,
    avatar: document.avatar ?? undefined,
    description: document.description ?? undefined,
    updateTime: document.updateTime ?? undefined
  });

export const toOrgMember = (document: OrgMemberDocument): OrgMember =>
  OrgMemberSchema.parse({
    id: toEntityId(document._id),
    teamId: toEntityId(document.teamId),
    orgId: toEntityId(document.orgId),
    tmbId: toEntityId(document.tmbId)
  });
