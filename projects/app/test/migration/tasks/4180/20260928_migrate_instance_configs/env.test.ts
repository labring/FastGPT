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
    vi.stubEnv('USE_IP_LIMIT', 'true');
    const first = buildLegacyDomainOverrides({ feConfigs: {}, systemEnv: {} });
    expect(first.site?.name).toBe('Migrated name');
    expect(first.performance?.workflow?.maxRunTimes).toBe(777);
    expect(first.security?.useIpLimit).toBe(true);
    vi.stubEnv('WORKFLOW_MAX_RUN_TIMES', '888');
    expect(readLegacyInstanceConfigEnv().WORKFLOW_MAX_RUN_TIMES).toBe(888);
  });

  it('keeps historical defaults and treats optional empty values as absent', () => {
    vi.stubEnv('PASSWORD_LOGIN_MINUTE_LIMIT_COUNT', '');
    vi.stubEnv('CUSTOM_PDF_PARSE_KEY', '');
    vi.stubEnv('AIPROXY_API_ENDPOINT', undefined);
    vi.stubEnv('AIPROXY_API_TOKEN', undefined);
    const legacy = readLegacyInstanceConfigEnv();
    expect(legacy.PASSWORD_LOGIN_MINUTE_LIMIT_COUNT).toBe(10);
    expect(legacy.CUSTOM_PDF_PARSE_KEY).toBeUndefined();
    expect(legacy.AIPROXY_API_ENDPOINT).toBeUndefined();
    expect(legacy.AIPROXY_API_TOKEN).toBeUndefined();
  });

  it('validates imported numbers and URLs without including secret values in errors', () => {
    vi.stubEnv('WORKFLOW_MAX_RUN_TIMES', '-1');
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'not-a-url-secret-value');
    expect(readLegacyInstanceConfigEnv).toThrow('WORKFLOW_MAX_RUN_TIMES');
    expect(readLegacyInstanceConfigEnv).toThrow('AIPROXY_API_ENDPOINT');
    try {
      readLegacyInstanceConfigEnv();
    } catch (error) {
      expect(String(error)).not.toContain('not-a-url-secret-value');
    }
  });
});
