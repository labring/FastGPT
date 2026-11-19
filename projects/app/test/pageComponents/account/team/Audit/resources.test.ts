import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { AuditResourceTypeEnum } from '@fastgpt/global/support/user/audit/type';
import type { AuditListItemType } from '@fastgpt/global/openapi/support/user/team/audit/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetCollectionTypeEnum } from '@fastgpt/global/core/dataset/constants';

const mocks = vi.hoisted(() => ({ logs: [] as AuditListItemType[] }));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
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
vi.mock('@/web/common/system/utils', () => ({ downloadFetch: vi.fn() }));
vi.mock('@fastgpt/web/components/common/DateRangePicker', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@fastgpt/web/components/common/TagFilter', () => ({
  MultiSelectFilter: () => null,
  createMultiSelectFilter: () => ({ mode: 'all', values: [] }),
  toMultiSelectFilterQuery: () => undefined,
  useCommonFilterLabels: () => ({})
}));
vi.mock('@/components/support/user/TeamMemberFilter', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/UserBox', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({
  default: ({ src }: { src?: string | null }) =>
    React.createElement('span', { 'data-avatar': src ?? '' })
}));

describe('AuditLog resource column', () => {
  beforeAll(() => vi.stubGlobal('React', React));
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllEnvs());

  it.each(['', '/fastgpt', '/app'])(
    'renders structured AuditResourceLink items with base URL "%s", concise summaries, and legacy fallbacks',
    async (baseUrl) => {
      // 部署前缀在模块加载时读取，重新加载组件以验证真实 URL helper。
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', baseUrl);
      vi.resetModules();
      const { default: AuditLog } = await import('@/pageComponents/account/team/Audit');

      const id = '68ad85a7463006c963799a05';
      const fileId = '68ad85a7463006c963799a20';
      const folderId = '68ad85a7463006c963799a21';
      mocks.logs = [
        {
          _id: 'structured',
          timestamp: new Date(),
          event: AuditEventEnum.CREATE_APP,
          metadata: { appName: 'Chat Bot', appType: 'Agent' },
          resources: [
            { type: AuditResourceTypeEnum.app, id, name: 'Chat Bot', avatar: '/bot.png' },
            { type: AuditResourceTypeEnum.tool, id, name: 'Search Tool' },
            { type: AuditResourceTypeEnum.appFolder, id, name: 'Agents Dir' },
            { type: AuditResourceTypeEnum.toolFolder, id, name: 'Tools Dir' },
            { type: AuditResourceTypeEnum.dataset, id, name: 'Docs KB' },
            { type: AuditResourceTypeEnum.datasetFolder, id, name: 'KB Dir' },
            {
              type: AuditResourceTypeEnum.collection,
              id: fileId,
              parentId: id,
              name: 'guide.pdf',
              collectionType: DatasetCollectionTypeEnum.file
            },
            {
              type: AuditResourceTypeEnum.collectionFolder,
              id: folderId,
              parentId: id,
              name: 'Sub Dir',
              collectionType: DatasetCollectionTypeEnum.folder
            },
            { type: AuditResourceTypeEnum.skill, id, name: 'SQL Skill' },
            { type: AuditResourceTypeEnum.skillFolder, id, name: 'Skills Dir' },
            { type: AuditResourceTypeEnum.app, id, name: 'Deleted App', deleted: true },
            { type: AuditResourceTypeEnum.member, id, name: 'Alice' },
            { type: AuditResourceTypeEnum.apiKey, id, name: 'Prod Key' }
          ]
        },
        {
          _id: 'login',
          timestamp: new Date(),
          event: AuditEventEnum.LOGIN,
          metadata: { name: 'operator' }
        },
        {
          _id: 'legacy-resource',
          timestamp: new Date(),
          event: AuditEventEnum.CREATE_APP,
          metadata: { appName: 'Legacy Tool', appType: 'app:toolType_workflow' },
          resources: [{ appId: id, appType: AppTypeEnum.workflowTool }] as any
        },
        {
          _id: 'rename',
          timestamp: new Date(),
          event: AuditEventEnum.CHANGE_MEMBER_NAME,
          metadata: { memberName: 'OldName', newName: 'NewName' },
          resources: [
            {
              type: AuditResourceTypeEnum.member,
              id,
              name: 'NewName'
            }
          ]
        }
      ] as AuditListItemType[];

      const html = renderToStaticMarkup(React.createElement(AuditLog, { Tabs: null }));
      expect(html.indexOf('account_team:log_time')).toBeLessThan(
        html.indexOf('account_team:log_user')
      );
      expect(html.indexOf('account_team:log_user')).toBeLessThan(
        html.indexOf('account_team:log_type')
      );
      expect(html.indexOf('account_team:log_type')).toBeLessThan(
        html.indexOf('account_team:log_resource')
      );
      expect(html.indexOf('account_team:log_resource')).toBeLessThan(
        html.indexOf('account_team:log_details')
      );
      expect(
        Array.from(html.matchAll(/href="([^"]+)"/g), ([, href]) => href.replaceAll('&amp;', '&'))
      ).toEqual([
        `${baseUrl}/app/detail?appId=${id}`,
        `${baseUrl}/app/detail?appId=${id}`,
        `${baseUrl}/dashboard/agent?parentId=${id}`,
        `${baseUrl}/dashboard/tool?parentId=${id}`,
        `${baseUrl}/dataset/detail?datasetId=${id}`,
        `${baseUrl}/dataset/list?parentId=${id}`,
        `${baseUrl}/dataset/detail?datasetId=${id}&currentTab=dataCard&collectionId=${fileId}`,
        `${baseUrl}/dataset/detail?datasetId=${id}&currentTab=collectionCard&parentId=${folderId}`,
        `${baseUrl}/skill/detail?skillId=${id}`,
        `${baseUrl}/dashboard/skill?parentId=${id}`,
        `${baseUrl}/app/detail?appId=${id}`
      ]);
      expect(html).toContain('data-avatar="/bot.png"');
      expect(html).toContain('Deleted App (account_team:audit_resource_deleted_suffix)');
      expect(html).toContain('Prod Key');
      expect(html).toContain('Legacy Tool');
      expect(html).not.toContain('account_team:resource_');
      expect(html).toContain('account_team:audit_detail_rename');
      expect(html).toContain('>-</td>');
    }
  );
});
