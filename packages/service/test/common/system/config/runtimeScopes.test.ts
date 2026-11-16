import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';
import { describe, expect, it } from 'vitest';
import { MongoSystemConfigs } from '../../../../common/system/config/schema';
import { readRuntimeConfigScopes } from '../../../../common/system/config/runtimeScopes';
import { computeSystemInitBufferId } from '../../../../common/system/systemInstanceConfig/runtime';
describe('readRuntimeConfigScopes', () => {
  it('projects new scopes and keeps ENV and subscription versions independent', async () => {
    await MongoSystemInstanceConfig.create({
      domain: 'proEnv',
      overrides: { teamMode: 'multi', ssoUrl: 'https://sso.test', showWecomConfig: true },
      revision: 1
    });
    await MongoSystemConfigs.create([
      {
        type: 'fastgpt',
        value: {
          feConfigs: { teamMode: 'sync', systemTitle: 'old' },
          systemEnv: { extension: 'old' },
          subPlans: { extraDatasetSize: { price: 99 } }
        }
      },
      { type: 'fastgptPro', value: { teamMode: 'sync' } },
      { type: 'proEnv', value: { teamMode: 'sync' } },
      { type: 'langfuse', value: { publicKey: 'old-public', secretKey: 'old-secret' } }
    ]);
    await MongoSystemInstanceConfig.create([
      { domain: 'subPlans', overrides: { extraDatasetSize: { price: 4 } }, revision: 2 },
      {
        domain: 'langfuse',
        overrides: { publicKey: 'synthetic-public', secretKey: 'synthetic-secret' },
        revision: 1
      }
    ]);
    const before = await readRuntimeConfigScopes();
    expect(before.fastgptConfig.feConfigs.teamMode).toBe('multi');
    expect(before.fastgptConfig.feConfigs.showWecomConfig).toBe(true);
    expect(before.fastgptConfig.feConfigs).not.toHaveProperty('systemTitle');
    expect(before.fastgptConfig.systemEnv.sso?.url).toBe('https://sso.test');
    expect(before.fastgptConfig.systemEnv).not.toHaveProperty('extension');
    expect(before.fastgptConfig.systemEnv.langfuse).toEqual({
      publicKey: 'synthetic-public',
      secretKey: 'synthetic-secret'
    });
    expect(before.fastgptConfig.subPlans?.extraDatasetSize?.price).toBe(4);
    const signature = (data: typeof before) =>
      computeSystemInitBufferId({
        subPlansUpdateTime: data.fastgptConfigTime,
        proEnvUpdateTime: data.proEnvUpdateTime
      });
    await MongoSystemInstanceConfig.updateOne(
      { domain: 'proEnv' },
      { $set: { 'overrides.teamMode': 'single' }, $inc: { revision: 1 } }
    );
    const after = await readRuntimeConfigScopes();
    expect(after.fastgptConfigTime).toBe(before.fastgptConfigTime);
    expect(signature(after)).not.toBe(signature(before));
  });
  it('uses safe defaults without creating records when scopes are absent', async () => {
    const result = await readRuntimeConfigScopes();
    expect(result.fastgptConfig.feConfigs.teamMode).toBe('single');
    expect(result.fastgptConfig.feConfigs.showWecomConfig).toBe(false);
    expect(result.fastgptConfig.subPlans).toBeUndefined();
    expect(await MongoSystemConfigs.countDocuments({})).toBe(0);
    expect(await MongoSystemInstanceConfig.countDocuments({})).toBe(0);
  });
});
