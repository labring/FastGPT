import type { MemberGroupSchemaType } from '../permission/memberGroup/type';
import type { OrgType } from './team/org/type';
import type { TeamMemberItemType } from './team/type';

export type SearchResult = {
  members: Omit<TeamMemberItemType, 'teamId' | 'permission'>[];
  orgs: Omit<OrgType, 'permission' | 'members'>[];
  groups: MemberGroupSchemaType[];
};
