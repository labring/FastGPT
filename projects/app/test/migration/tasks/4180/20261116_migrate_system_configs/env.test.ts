import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLegacyInstanceConfigEnv } from '@/migration/tasks/4180/20261116_migrate_system_configs/env';
import {
  buildLegacyDomainOverrides,
  buildSparseLegacyMigrationPlan,
  buildSparseLegacyOverrides
} from '@/migration/tasks/4180/20261116_migrate_system_configs/service';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';

afterEach(() => vi.unstubAllEnvs());

describe('legacy instance config ENV import', () => {
  it('ignores retired WeChat concurrency ENV without blocking migration', () => {
    vi.stubEnv('WECHAT_CHANNEL_CONCURRENCY', 'invalid');
    expect(readLegacyInstanceConfigEnv()).not.toHaveProperty('WECHAT_CHANNEL_CONCURRENCY');
    expect(
      buildSparseLegacyOverrides({ feConfigs: {}, systemEnv: {} }).performance ?? {}
    ).not.toHaveProperty('channel');
  });

  it('ignores retired sandbox limit ENV even when values are invalid', () => {
    for (const key of [
      'AGENT_SANDBOX_ENTRYPOINT_TIMEOUT_SECONDS',
      'AGENT_SANDBOX_WS_MAX_MESSAGE_BYTES',
      'AGENT_SANDBOX_WS_MAX_FRAME_BYTES'
    ]) {
      vi.stubEnv(key, 'invalid');
      expect(readLegacyInstanceConfigEnv()).not.toHaveProperty(key);
    }
    const common = buildLegacyDomainOverrides({ feConfigs: {}, systemEnv: {} }).subservice
      ?.agentSandbox?.common;
    for (const key of ['entrypointTimeoutSeconds', 'wsMaxMessageBytes', 'wsMaxFrameBytes']) {
      expect(common).not.toHaveProperty(key);
    }
  });

  it('does not migrate deployment-only datasource addresses into a scope', () => {
    const keys = [
      'FEISHU_BASE_URL',
      'DINGTALK_BASE_URL',
      'DINGTALK_OAPI_BASE_URL',
      'YUQUE_DATASET_BASE_URL'
    ];
    for (const key of keys) vi.stubEnv(key, 'https://private-platform.example.com');
    const legacyEnv = readLegacyInstanceConfigEnv();
    for (const key of keys) expect(legacyEnv).not.toHaveProperty(key);
    expect(
      buildLegacyDomainOverrides({ feConfigs: {}, systemEnv: {}, legacyEnv }).providers
    ).not.toHaveProperty('dataSource');
  });

  it.each(['8', 'invalid'])('不导入旧 EVAL_CONCURRENCY=%s，也不因其格式阻塞迁移', (value) => {
    vi.stubEnv('EVAL_CONCURRENCY', value);
    expect(readLegacyInstanceConfigEnv()).not.toHaveProperty('EVAL_CONCURRENCY');
    const overrides = buildSparseLegacyOverrides({ feConfigs: {}, systemEnv: {} });
    expect(overrides.performance?.task).toBeUndefined();
    expect(resolveSystemInstanceConfig(overrides).performance.task.evalConcurrency).toBe(3);
  });

  it('不导入旧并发时，首次默认文件仍可设置新并发', () => {
    vi.stubEnv('EVAL_CONCURRENCY', '9');
    const { overrides } = buildSparseLegacyMigrationPlan({
      feConfigs: {},
      systemEnv: {},
      defaults: { performance: { task: { evalConcurrency: 7 } } }
    });
    expect(resolveSystemInstanceConfig(overrides).performance.task.evalConcurrency).toBe(7);
  });

  it('把旧归档下载 ENV 迁入资源配置，保留已有部署的非默认值', () => {
    vi.stubEnv('DATASET_ARCHIVE_MAX_FILES', '123');
    vi.stubEnv('DATASET_ARCHIVE_MAX_SOURCE_SIZE_MB', '456');
    vi.stubEnv('DATASET_ARCHIVE_MAX_CONCURRENCY', '7');
    vi.stubEnv('DATASET_ARCHIVE_PREPARE_TIMEOUT_SECONDS', '89');
    const overrides = buildSparseLegacyOverrides({ feConfigs: {}, systemEnv: {} });
    expect(overrides.resource?.datasetArchive).toEqual({
      maxFiles: 123,
      maxSourceSizeMiB: 456,
      maxConcurrency: 7,
      prepareTimeoutSeconds: 89
    });
  });

  it('reads legacy values only when the migration runs, including updated values after module import', () => {
    vi.stubEnv('SYSTEM_NAME', 'Migrated name');
    vi.stubEnv('WORKFLOW_MAX_RUN_TIMES', '777');
    vi.stubEnv('CSRF_ENABLED', 'false');
    const first = buildLegacyDomainOverrides({ feConfigs: {}, systemEnv: {} });
    expect(first.site?.name).toBe('Migrated name');
    expect(first.performance?.workflow?.maxRunTimes).toBe(777);
    expect(first.security?.csrfEnabled).toBe(false);
    vi.stubEnv('WORKFLOW_MAX_RUN_TIMES', '888');
    expect(readLegacyInstanceConfigEnv().WORKFLOW_MAX_RUN_TIMES).toBe(888);
  });

  it('keeps historical defaults and treats optional empty values as absent', () => {
    vi.stubEnv('PASSWORD_LOGIN_MINUTE_LIMIT_COUNT', '');
    vi.stubEnv('CUSTOM_PDF_PARSE_KEY', '');
    vi.stubEnv('CODE_SANDBOX_URL', undefined);
    const legacy = readLegacyInstanceConfigEnv();
    expect(legacy.PASSWORD_LOGIN_MINUTE_LIMIT_COUNT).toBe(10);
    expect(legacy.CUSTOM_PDF_PARSE_KEY).toBeUndefined();
    expect(legacy.CODE_SANDBOX_URL).toBeUndefined();
  });

  it('validates imported numbers and URLs without including secret values in errors', () => {
    vi.stubEnv('WORKFLOW_MAX_RUN_TIMES', '-1');
    vi.stubEnv('CODE_SANDBOX_URL', 'not-a-url-secret-value');
    const warn = vi
      .spyOn(getLogger(LogCategories.SYSTEM.UPGRADE), 'warn')
      .mockImplementation(() => {});
    try {
      const env = readLegacyInstanceConfigEnv();
      expect(env.WORKFLOW_MAX_RUN_TIMES).toBe('-1');
      expect(env.CODE_SANDBOX_URL).toBe('not-a-url-secret-value');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('not-a-url-secret-value');
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it.each([
    ['true', true],
    [' YES ', true],
    ['1', true],
    ['false', false],
    ['OFF', false],
    ['0', false]
  ])('accepts legacy boolean %s as %s', (value, expected) => {
    vi.stubEnv('CSRF_ENABLED', value);
    expect(readLegacyInstanceConfigEnv().CSRF_ENABLED).toBe(expected);
  });

  it.each([
    'AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY',
    'CHECK_INTERNAL_IP',
    'CSRF_ENABLED',
    'MULTIPLE_DATA_TO_BASE64',
    'SKIP_FILE_TYPE_CHECK',
    'SHOW_COUPON',
    'SHOW_DISCOUNT_COUPON',
    'HIDE_CHAT_COPYRIGHT_SETTING'
  ])('retains invalid boolean for %s without printing its value', (key) => {
    vi.stubEnv(key, 'treu-secret-value');
    const warn = vi
      .spyOn(getLogger(LogCategories.SYSTEM.UPGRADE), 'warn')
      .mockImplementation(() => {});
    try {
      expect(
        readLegacyInstanceConfigEnv()[key as keyof ReturnType<typeof readLegacyInstanceConfigEnv>]
      ).toBe('treu-secret-value');
      expect(JSON.stringify(warn.mock.calls)).toContain(key);
      expect(JSON.stringify(warn.mock.calls)).not.toContain('treu-secret-value');
    } finally {
      warn.mockRestore();
    }
  });
});
