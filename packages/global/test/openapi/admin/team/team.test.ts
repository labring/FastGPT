import { describe, expect, it } from 'vitest';
import {
  TeamMemberItemSchema,
  GetTeamMembersResponseSchema
} from '../../../../openapi/admin/team/api';

describe('Admin team schemas', () => {
  it('tolerates missing username for orphan members with default empty string', () => {
    const normal = TeamMemberItemSchema.parse({
      userName: 'alice',
      teamId: '68ad85a7463006c963799a05',
      role: 'owner',
      status: 'active'
    });
    expect(normal.userName).toBe('alice');

    const orphan = TeamMemberItemSchema.parse({
      teamId: '68ad85a7463006c963799a05',
      role: 'member',
      status: 'active'
    });
    expect(orphan.userName).toBe('');
  });

  it('parses team members response successfully even with orphan members', () => {
    const response = GetTeamMembersResponseSchema.parse({
      members: [
        {
          userName: 'bob',
          teamId: '68ad85a7463006c963799a05',
          role: 'admin',
          status: 'active'
        },
        {
          userName: '',
          teamId: '68ad85a7463006c963799a05',
          role: 'member',
          status: 'active'
        }
      ],
      team: {
        _id: '68ad85a7463006c963799a05',
        name: 'Engineering'
      }
    });

    expect(response.members).toHaveLength(2);
    expect(response.members[1].userName).toBe('');
  });
});
