import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLegacyInstanceConfigEnv } from '@/migration/tasks/4180/20260928_migrate_instance_configs/env';
import {
  buildLegacyDomainOverrides,
  buildSparseLegacyOverrides
} from '@/migration/tasks/4180/20260928_migrate_instance_configs/service';

afterEach(() => vi.unstubAllEnvs());

describe('legacy instance config ENV import', () => {
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
    expect(readLegacyInstanceConfigEnv).toThrow('WORKFLOW_MAX_RUN_TIMES');
    expect(readLegacyInstanceConfigEnv).toThrow('CODE_SANDBOX_URL');
    try {
      readLegacyInstanceConfigEnv();
    } catch (error) {
      expect(String(error)).not.toContain('not-a-url-secret-value');
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
    'HIDE_CHAT_COPYRIGHT_SETTING',
    'WECOM_LOGIN_AUTO_REDIRECT'
  ])('rejects invalid boolean for %s without printing its value', (key) => {
    vi.stubEnv(key, 'treu-secret-value');
    expect(readLegacyInstanceConfigEnv).toThrow(key);
    expect(readLegacyInstanceConfigEnv).not.toThrow('treu-secret-value');
  });
});
