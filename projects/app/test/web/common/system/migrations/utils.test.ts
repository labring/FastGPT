import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import zhMigration from '@fastgpt/web/i18n/zh-CN/system_migration.json';
import enMigration from '@fastgpt/web/i18n/en/system_migration.json';
import zhHantMigration from '@fastgpt/web/i18n/zh-Hant/system_migration.json';
import koMigration from '@fastgpt/web/i18n/ko-KR/system_migration.json';
import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type { SystemMigrationListItem } from '@fastgpt/global/migration/schema';
import {
  getSystemMigrationDisplayStatus,
  getSystemMigrationErrorText,
  getSystemMigrationProgressPercent
} from '@/web/common/system/migrations/utils';

describe('getSystemMigrationErrorText', () => {
  const resources = {
    'zh-CN': { system_migration: zhMigration },
    en: { system_migration: enMigration },
    'zh-Hant': { system_migration: zhHantMigration },
    'ko-KR': { system_migration: koMigration }
  };
  const error = {
    code: 409,
    message: 'system_migration:prerequisite_not_succeeded',
    data: {
      prerequisiteNameKey: 'system_migration:migrations.20261008_migrate_chunk_training.name'
    }
  };

  it.each([
    ['zh-CN', '请先执行「迁移旧版知识库训练任务」，并等待其成功完成后再执行当前任务。'],
    [
      'en',
      'Run "Migrate legacy dataset training tasks" first and wait for it to succeed before running this task.'
    ],
    ['zh-Hant', '請先執行「遷移舊版知識庫訓練任務」，並等待其成功完成後再執行目前任務。'],
    [
      'ko-KR',
      '먼저 "이전 데이터셋 학습 작업 마이그레이션" 작업을 실행하고 성공적으로 완료된 후 현재 작업을 실행하세요.'
    ]
  ])('translates both the task name and instruction in %s', async (language, expected) => {
    const i18n = createInstance();
    await i18n.init({ lng: language, resources, fallbackLng: false });
    const t = (key: string, options?: { name: string }) => i18n.t(key as any, options);

    expect(getSystemMigrationErrorText(error, t)).toBe(expected);
    expect(getSystemMigrationErrorText(error, t)).not.toContain('20261008');
    expect(getSystemMigrationErrorText(new Error('Network failure'), t)).toBe('Network failure');
  });
});

const createMigration = (
  input: Partial<SystemMigrationListItem> = {}
): SystemMigrationListItem => ({
  id: '20260903_ui_state',
  version: '4.17.0',
  order: 1,
  nameKey: 'system_migration:migrations.example.name',
  descriptionKey: 'system_migration:migrations.example.description',
  blockStartup: false,
  independent: true,
  status: SystemMigrationStatusEnum.pending,
  progress: [],
  failedRecordCount: 0,
  ...input
});

describe('system migration UI state', () => {
  it('marks an expired running lease as waiting for takeover', () => {
    const migration = createMigration({
      status: SystemMigrationStatusEnum.running,
      leaseExpireAt: new Date('2026-09-03T10:00:00.000Z')
    });

    expect(
      getSystemMigrationDisplayStatus({
        migration,
        serverTime: '2026-09-03T10:00:01.000Z'
      })
    ).toBe('reclaiming');
    expect(
      getSystemMigrationDisplayStatus({
        migration,
        serverTime: '2026-09-03T09:59:59.000Z'
      })
    ).toBe(SystemMigrationStatusEnum.running);
    expect(
      getSystemMigrationDisplayStatus({
        migration: { ...migration, leaseExpireAt: undefined },
        serverTime: '2026-09-03T10:00:01.000Z'
      })
    ).toBe('reclaiming');
  });

  it('bounds deterministic progress and omits an unknown total', () => {
    expect(
      getSystemMigrationProgressPercent({
        key: 'test_progress',
        labelKey: 'system_migration:migrations.example.progress',
        status: SystemMigrationStatusEnum.running,
        current: 12,
        total: 10,
        updatedAt: new Date()
      })
    ).toBe(100);
    expect(
      getSystemMigrationProgressPercent({
        key: 'test_progress',
        labelKey: 'system_migration:migrations.example.progress',
        status: SystemMigrationStatusEnum.running,
        current: 12,
        updatedAt: new Date()
      })
    ).toBeUndefined();
  });

  it('shows explicitly empty progress and uses provided counts for nonempty totals', () => {
    const progress = {
      key: 'test_progress',
      labelKey: 'system_migration:migrations.example.progress',
      status: SystemMigrationStatusEnum.running,
      current: 0,
      total: 0
    };
    expect(getSystemMigrationProgressPercent(progress)).toBe(0);
    expect(
      getSystemMigrationProgressPercent({
        ...progress,
        status: SystemMigrationStatusEnum.succeeded
      })
    ).toBe(100);
    expect(
      getSystemMigrationProgressPercent({
        ...progress,
        total: 10
      })
    ).toBe(0);
    expect(
      getSystemMigrationProgressPercent({
        ...progress,
        status: SystemMigrationStatusEnum.succeeded,
        current: 3,
        total: 10
      })
    ).toBe(30);
  });

  it.each(Object.values(SystemMigrationStatusEnum))(
    'hides absent or incomplete progress regardless of stage status %s',
    (status) => {
      const progress = {
        key: 'test_progress',
        labelKey: 'system_migration:migrations.example.progress',
        status
      };
      expect(getSystemMigrationProgressPercent(progress)).toBeUndefined();
      expect(getSystemMigrationProgressPercent({ ...progress, current: 0 })).toBeUndefined();
      expect(getSystemMigrationProgressPercent({ ...progress, total: 0 })).toBeUndefined();
    }
  );
});
