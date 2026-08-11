import { TeamMemberDetailSchema, type TeamMemberDetail } from '../../domain/team';
import type { TeamMemberDocument } from '../models/teamMember';
import { toEntityId } from '../utils';

export const toTeamMemberDetail = (document: TeamMemberDocument): TeamMemberDetail =>
  TeamMemberDetailSchema.parse({
    id: toEntityId(document._id),
    teamId: toEntityId(document.teamId),
    userId: toEntityId(document.userId),
    avatar: document.avatar ?? undefined,
    name: document.name,
    role: document.role ?? undefined,
    status: document.status ?? undefined
  });
