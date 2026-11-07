import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import type { TeamAuditListItemType } from '@fastgpt/global/support/user/audit/type';

const mocks = vi.hoisted(() => ({ logs: [] as TeamAuditListItemType[] }));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@fastgpt/web/hooks/usePagination', () => ({
  usePagination: () => ({
    data: mocks.logs,
    isLoading: false,
    total: mocks.logs.length,
    pageSize: 20,
    Pagination: () => null
  })
}));
vi.mock('@/web/support/user/team/operantionLog/api', () => ({ getOperationLogs: vi.fn() }));
vi.mock('@fastgpt/web/components/common/TagFilter', () => ({
  MultiSelectFilter: () => null,
  createMultiSelectFilter: () => ({ mode: 'all', values: [] }),
  toMultiSelectFilterQuery: () => undefined,
  useCommonFilterLabels: () => ({})
}));
vi.mock('@/components/support/user/TeamMemberFilter', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/UserBox', () => ({ default: () => null }));

describe('AuditLog resource column', () => {
  beforeAll(() => vi.stubGlobal('React', React));
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllEnvs());

  it.each(['', '/fastgpt'])(
    'renders resource links with base URL "%s" and tolerates old logs',
    async (baseUrl) => {
      // 部署前缀在模块加载时读取，重新加载组件以验证真实 URL helper。
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', baseUrl);
      vi.resetModules();
      const { default: AuditLog } = await import('@/pageComponents/account/team/Audit');

      const id = '68ad85a7463006c963799a05';
      mocks.logs = [
        {
          _id: 'linked',
          timestamp: new Date(),
          event: AuditEventEnum.CREATE_APP,
          metadata: { appName: 'original', appType: 'Agent' },
          resources: [{ appId: id }, { skillId: id }, { datasetId: id }, { collectionId: id }]
        },
        {
          _id: 'legacy',
          timestamp: new Date(),
          event: AuditEventEnum.LOGIN,
          metadata: {}
        },
        {
          _id: 'legacy-collection',
          timestamp: new Date(),
          event: AuditEventEnum.LOGIN,
          metadata: { name: 'operator' },
          resources: [{ collectionId: id }]
        }
      ] as TeamAuditListItemType[];

      const html = renderToStaticMarkup(React.createElement(AuditLog, { Tabs: null }));
      expect(html.indexOf('account_team:log_user')).toBeLessThan(
        html.indexOf('account_team:log_resource')
      );
      expect(html.indexOf('account_team:log_resource')).toBeLessThan(
        html.indexOf('account_team:log_time')
      );
      expect(Array.from(html.matchAll(/href="([^"]+)"/g), ([, href]) => href)).toEqual([
        `${baseUrl}/app/detail?appId=${id}`,
        `${baseUrl}/skill/detail?skillId=${id}`,
        `${baseUrl}/dataset/detail?datasetId=${id}`
      ]);
      expect(html).not.toContain('collectionId=');
      expect(html).toContain('>-</td>');
    }
  );
});
