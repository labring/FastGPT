import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { JSDOM } from 'jsdom';
import { createInstance } from 'i18next';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { theme } from '@fastgpt/web/styles/theme';
import zhMigration from '@fastgpt/web/i18n/zh-CN/system_migration.json';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationListResponse,
  SystemMigrationProgressListItem
} from '@fastgpt/global/migration/schema';

const mocks = vi.hoisted(() => ({ data: undefined as SystemMigrationListResponse | undefined }));
const i18n = createInstance();

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mocks.data, isFetching: false, isError: false, refetch: vi.fn() })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: i18n.t.bind(i18n) })
}));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: vi.fn(), loading: false })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Textarea/JsonEditor', () => ({ default: () => null }));
vi.mock('@/web/common/system/migrations/api', () => ({
  getSystemMigrationList: vi.fn(),
  getSystemMigrationFailedRecords: vi.fn(),
  retrySystemMigration: vi.fn(),
  startSystemMigration: vi.fn()
}));

import SystemMigrationsPage from '@/pageComponents/admin/config/Migration';

beforeAll(async () => {
  vi.stubGlobal('React', React);
  await i18n.init({ lng: 'zh-CN', resources: { 'zh-CN': { system_migration: zhMigration } } });
});
afterAll(() => vi.unstubAllGlobals());

/** 真实渲染升级页面，只替换摘要接口与无关弹窗，验证计数和进度条的最终 DOM。 */
const renderProgress = (progress: Omit<SystemMigrationProgressListItem, 'key' | 'labelKey'>[]) => {
  mocks.data = {
    serverTime: new Date(),
    migrations: [
      {
        id: '20261104_backfill_chat_publish_source',
        version: '4.18.0',
        order: 1,
        nameKey: 'system_migration:migrations.20261104_backfill_chat_publish_source.name',
        descriptionKey:
          'system_migration:migrations.20261104_backfill_chat_publish_source.description',
        blockStartup: false,
        independent: true,
        status: SystemMigrationStatusEnum.running,
        failedRecordCount: 0,
        progress: progress.map((item, index) => ({
          ...item,
          key: `stage-${index}`,
          labelKey: 'system_migration:migrations.20261104_backfill_chat_publish_source.chats'
        }))
      }
    ]
  };
  return new JSDOM(
    renderToStaticMarkup(
      React.createElement(ChakraProvider, { theme }, React.createElement(SystemMigrationsPage))
    )
  );
};

const renderSucceededResult = (params: Record<string, string | number>) => {
  mocks.data = {
    serverTime: new Date(),
    migrations: [
      {
        id: '20260928_migrate_instance_configs',
        version: '4.18.0',
        order: 1,
        nameKey: 'system_migration:migrations.20260928_migrate_instance_configs.name',
        descriptionKey: 'system_migration:migrations.20260928_migrate_instance_configs.description',
        blockStartup: true,
        independent: false,
        status: SystemMigrationStatusEnum.succeeded,
        failedRecordCount: 0,
        result: {
          key: 'system_migration:migrations.20260928_migrate_instance_configs.result',
          params
        },
        progress: []
      }
    ]
  } as SystemMigrationListResponse;
  return new JSDOM(
    renderToStaticMarkup(
      React.createElement(ChakraProvider, { theme }, React.createElement(SystemMigrationsPage))
    )
  );
};

describe('migration stage progress', () => {
  it('shows processed counts without a total while running, completed or failed, including zero', () => {
    const dom = renderProgress([
      { status: SystemMigrationStatusEnum.running, current: 0 },
      { status: SystemMigrationStatusEnum.succeeded, current: 2776 },
      { status: SystemMigrationStatusEnum.failed, current: 15826 }
    ]);
    try {
      const document = dom.window.document;
      for (const count of [0, 2776, 15826]) {
        expect(document.body.textContent).toContain(`已处理 ${count} 条`);
      }
      expect(document.querySelector('[role="progressbar"]')).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it('keeps the current/total label and determinate progress when a total is known', () => {
    const dom = renderProgress([
      { status: SystemMigrationStatusEnum.running, current: 4, total: 10 }
    ]);
    try {
      expect(dom.window.document.body.textContent).toContain('4 / 10');
      expect(
        dom.window.document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')
      ).toBe('40');
    } finally {
      dom.window.close();
    }
  });

  it('shows skipped legacy config paths in a succeeded result', () => {
    const dom = renderSucceededResult({
      migratedDomainCount: 11,
      skippedConfigCount: 2,
      skippedDomainCount: 1,
      skippedPaths: 'security.maxLoginSession, commercial.*'
    });
    try {
      const text = dom.window.document.body.textContent ?? '';
      expect(text).toContain('2 个旧配置项');
      expect(text).toContain('security.maxLoginSession');
      expect(text).toContain('commercial.*');
    } finally {
      dom.window.close();
    }
  });

  it('does not invent a processed count or percentage for stages that have not reported one', () => {
    const dom = renderProgress([
      { status: SystemMigrationStatusEnum.pending },
      { status: SystemMigrationStatusEnum.running, total: 10 },
      { status: SystemMigrationStatusEnum.succeeded }
    ]);
    try {
      expect(dom.window.document.body.textContent).not.toContain('已处理');
      expect(dom.window.document.querySelector('[role="progressbar"]')).toBeNull();
    } finally {
      dom.window.close();
    }
  });
});
