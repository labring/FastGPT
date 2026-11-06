import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import AuditLog from '@/pageComponents/account/team/Audit';
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

  it('renders resource links in the second column and tolerates old logs', () => {
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
    expect(html).toContain(`/app/detail?appId=${id}`);
    expect(html).toContain(`/skill/detail?skillId=${id}`);
    expect(html).toContain(`/dataset/detail?datasetId=${id}`);
    expect(html).not.toContain('collectionId=');
    expect(html).toContain('>-</td>');
  });
});
