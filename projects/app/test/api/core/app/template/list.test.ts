import { describe, expect, it, vi } from 'vitest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getFakeUsers } from '@test/datas/users';
import { Call } from '@test/utils/request';

const mocks = vi.hoisted(() => ({ getAppTemplatesAndLoadThem: vi.fn() }));

vi.mock('@fastgpt/service/core/app/templates/register', () => ({
  getAppTemplatesAndLoadThem: mocks.getAppTemplatesAndLoadThem
}));

import handler from '@/pages/api/core/app/template/list';

describe('template list api', () => {
  it('returns experienceUrl for market cards', async () => {
    const users = await getFakeUsers(1);
    mocks.getAppTemplatesAndLoadThem.mockResolvedValue([
      {
        templateId: 'community-demo',
        name: 'Demo',
        intro: '',
        avatar: '',
        tags: [],
        type: AppTypeEnum.workflow,
        isActive: true,
        experienceUrl: 'https://demo.example.com',
        workflow: { nodes: [], edges: [] }
      }
    ]);

    const res = await Call(handler, {
      auth: users.members[0],
      query: { type: 'all' }
    });

    expect(res.code).toBe(200);
    expect((res.data as any).list[0].experienceUrl).toBe('https://demo.example.com');
  });
});
