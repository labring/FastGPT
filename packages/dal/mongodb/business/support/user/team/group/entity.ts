import {
  GroupMemberSchema,
  MemberGroupSchema,
  type GroupMember,
  type MemberGroup
} from '../../../../../../business/support/user/team/group';
import type { GroupMemberDocument } from './member/schema';
import type { MemberGroupDocument } from './schema';
import { toEntityId } from '../../../../../utils';

export const toMemberGroup = (document: MemberGroupDocument): MemberGroup =>
  MemberGroupSchema.parse({
    id: toEntityId(document._id),
    teamId: toEntityId(document.teamId),
    name: document.name,
    avatar: document.avatar ?? undefined,
    updateTime: document.updateTime ?? undefined
  });

export const toGroupMember = (document: GroupMemberDocument): GroupMember =>
  GroupMemberSchema.parse({
    id: toEntityId(document._id),
    groupId: toEntityId(document.groupId),
    tmbId: toEntityId(document.tmbId),
    role: document.role
  });
