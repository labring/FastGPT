import { describe, expect, it } from 'vitest';
import {
  AdminSwitchTeamBodySchema,
  AdminSwitchTeamResponseSchema,
  AdminTeamSelectorQuerySchema,
  AdminTeamSelectorResponseSchema,
  TeamMemberItemSchema,
  GetTeamMembersResponseSchema
} from '../../../../openapi/admin/team/api';
import { openAPIDocument } from '../../../../openapi/provider/devapi';

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

  it('registers admin team switch and selector list OpenAPI contracts', () => {
    expect(openAPIDocument.paths?.['/admin/team/switch']?.put).toBeDefined();
    expect(openAPIDocument.paths?.['/admin/team/list']?.get).toBeDefined();

    const parsedBody = AdminSwitchTeamBodySchema.parse({
      teamId: '68ad85a7463006c963799a05'
    });
    expect(parsedBody).toEqual({ teamId: '68ad85a7463006c963799a05' });

    const parsedSwitchRes = AdminSwitchTeamResponseSchema.parse({
      token: '68ad85a7463006c963799a05:token123',
      teamId: '68ad85a7463006c963799a06',
      tmbId: '68ad85a7463006c963799a07'
    });
    expect(parsedSwitchRes.teamId).toBe('68ad85a7463006c963799a06');

    const parsedQuery = AdminTeamSelectorQuerySchema.parse({ search: '  Alpha  ' });
    expect(parsedQuery).toEqual({ search: 'Alpha', limit: 100 });

    const parsedListRes = AdminTeamSelectorResponseSchema.parse({
      list: [{ teamId: '68ad85a7463006c963799a06', teamName: 'Alpha Team', avatar: null }]
    });
    expect(parsedListRes.list[0].teamName).toBe('Alpha Team');
  });
});
