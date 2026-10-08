import { describe, it, expect, beforeEach } from 'vitest';
import {
  updateDomainConfig,
  getSystemInstanceConfig,
  reloadSystemInstanceConfig
} from '../../../../common/system/systemInstanceConfig/controller';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';

describe('Runtime Switchover Integration Test', () => {
  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
    await reloadSystemInstanceConfig();
  });

  it('reflects domain updates in the in-memory singleton immediately', async () => {
    // 1. Initial snapshot has schema defaults
    const initial = getSystemInstanceConfig();
    expect(initial.site.name).toBe('AI');
    expect(initial.feature.showEmptyChat).toBe(true);

    const initialBufferId = global.systemInitBufferId;

    // 2. Update site config via Admin updateDomainConfig
    await updateDomainConfig({
      domain: 'site',
      expectedRevision: 0,
      submittedOverrides: { name: 'Acme Enterprise AI' },
      actor: { actor: 'admin', userId: 'admin-1' }
    });

    // 3. In-memory singleton reflects the update without restart
    const afterSiteUpdate = getSystemInstanceConfig();
    expect(afterSiteUpdate.site.name).toBe('Acme Enterprise AI');
    expect(global.systemInstanceConfig?.site.name).toBe('Acme Enterprise AI');

    // 4. BufferId has rotated to invalidate frontend client caches
    expect(global.systemInitBufferId).not.toBe(initialBufferId);

    // 5. Update feature domain
    const prevBufferId = global.systemInitBufferId;
    await updateDomainConfig({
      domain: 'feature',
      expectedRevision: 0,
      submittedOverrides: { showEmptyChat: false, hideChatCopyrightSetting: true },
      actor: { actor: 'admin', userId: 'admin-1' }
    });

    // 6. Both site and feature domains retain their overrides in memory
    const finalConfig = getSystemInstanceConfig();
    expect(finalConfig.site.name).toBe('Acme Enterprise AI');
    expect(finalConfig.feature.showEmptyChat).toBe(false);
    expect(finalConfig.feature.hideChatCopyrightSetting).toBe(true);
    expect(global.systemInitBufferId).not.toBe(prevBufferId);
  });

  it('guarantees consistency across fresh reloadSystemInstanceConfig calls', async () => {
    await updateDomainConfig({
      domain: 'performance',
      expectedRevision: 0,
      submittedOverrides: {
        workflow: { maxRunTimes: 888, parallelMaxConcurrency: 8 }
      },
      actor: { actor: 'admin', userId: 'admin-1' }
    });

    const reloaded = await reloadSystemInstanceConfig();
    expect(reloaded.performance.workflow.maxRunTimes).toBe(888);
    expect(reloaded.performance.workflow.parallelMaxConcurrency).toBe(8);

    const singleton = getSystemInstanceConfig();
    expect(singleton.performance.workflow.maxRunTimes).toBe(888);
  });

  it('verifies that site.favicon updates in memory and passes to runtime', async () => {
    // 1. 保存 site.favicon
    await updateDomainConfig({
      domain: 'site',
      expectedRevision: 0,
      submittedOverrides: {
        favicon: '/api/system/img/avatar/custom-test-favicon.png',
        name: 'My New Brand'
      },
      actor: { actor: 'admin' }
    });

    const config = getSystemInstanceConfig();
    expect(config.site.favicon).toBe('/api/system/img/avatar/custom-test-favicon.png');
    expect(config.site.name).toBe('My New Brand');
  });
});
