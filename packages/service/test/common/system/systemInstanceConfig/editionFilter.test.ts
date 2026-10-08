import { describe, expect, it, beforeEach } from 'vitest';
import {
  getDomainConfigForAdmin,
  findOverridesNotAllowedByEdition,
  getServiceEdition,
  updateDomainConfig
} from '../../../../common/system/systemInstanceConfig/controller';
import { MongoSystemInstanceConfig } from '../../../../common/system/systemInstanceConfig/schema';
import { SECRET_MASK } from '@fastgpt/global/common/system/config';

describe('service edition gating for Admin config APIs', () => {
  beforeEach(async () => {
    await MongoSystemInstanceConfig.deleteMany({});
  });

  it('detects edition from PRO_URL presence (community by default in test env)', () => {
    // 测试环境未配置 PRO_URL，服务端权威判定应为社区版
    expect(getServiceEdition()).toBe('community');
  });

  it('strips pro-only fields from community edition reads but keeps them for pro', async () => {
    // teamMode 是 auth 域下 edition=pro 的字段，openApiKeyMaxCount 是 edition=all
    await updateDomainConfig({
      domain: 'auth',
      expectedRevision: 0,
      submittedOverrides: { teamMode: 'multi', openApiKeyMaxCount: 200 },
      actor: { actor: 'system' }
    });

    const community = await getDomainConfigForAdmin('auth', 'community');
    expect(community.effectiveConfig.teamMode).toBeUndefined();
    expect(community.overrides.teamMode).toBeUndefined();
    expect(community.effectiveConfig.openApiKeyMaxCount).toBe(200);
    expect(community.secretKeys).not.toContain('teamMode');

    const pro = await getDomainConfigForAdmin('auth', 'pro');
    expect(pro.effectiveConfig.teamMode).toBe('multi');
    expect(pro.overrides.teamMode).toBe('multi');
  });

  it('strips pro-only loginProviders secrets from community reads but masks them for pro', async () => {
    await updateDomainConfig({
      domain: 'auth',
      expectedRevision: 0,
      submittedOverrides: {
        loginProviders: { github: { clientId: 'cid', secret: 'real-secret' } }
      },
      actor: { actor: 'system' }
    });

    const community = await getDomainConfigForAdmin('auth', 'community');
    // pro-only 的 loginProviders 在社区版读取中被整体剔除
    expect((community.effectiveConfig as any).loginProviders?.github?.secret).toBeUndefined();
    expect((community.overrides as any).loginProviders).toBeUndefined();

    const pro = await getDomainConfigForAdmin('auth', 'pro');
    // 商业版读取时敏感字段仍要脱敏
    expect((pro.effectiveConfig as any).loginProviders?.github?.secret).toBe(SECRET_MASK);
    expect(pro.secretKeys).toContain('loginProviders.github.secret');
  });

  it('lists pro-only keys as offenders for community submissions', () => {
    const offenders = findOverridesNotAllowedByEdition(
      'auth',
      { teamMode: 'multi', openApiKeyMaxCount: 100 },
      'community'
    );

    expect(offenders).toEqual(['teamMode']);

    const proOffenders = findOverridesNotAllowedByEdition(
      'auth',
      { teamMode: 'multi', loginProviders: { github: { clientId: 'cid' } } },
      'pro'
    );
    expect(proOffenders).toEqual([]);

    // 空提交不应产生越权字段
    expect(findOverridesNotAllowedByEdition('auth', {}, 'community')).toEqual([]);
  });

  it('treats arrays and nested objects as leaves or paths consistently', () => {
    // fastLogin 是 pro-only 数组字段，整体按一个越权路径上报
    const offenders = findOverridesNotAllowedByEdition(
      'auth',
      { fastLogin: [{ key: 'k1', authUrl: 'https://x.example.com' }], openApiKeyMaxCount: 50 },
      'community'
    );
    expect(offenders).toEqual(['fastLogin']);

    // 嵌套 pro-only 对象按叶子路径上报
    const nested = findOverridesNotAllowedByEdition(
      'auth',
      { loginProviders: { github: { clientId: 'cid', secret: 's' } } },
      'community'
    );
    expect(nested.sort()).toEqual([
      'loginProviders.github.clientId',
      'loginProviders.github.secret'
    ]);
  });

  it('hides pro-only commercial fields pre-seeded in DB from community reads', async () => {
    // 模拟历史上由商业版写入的文档：社区版部署读取时必须过滤
    await MongoSystemInstanceConfig.create({
      _id: 'commercial',
      schemaVersion: 1,
      revision: 1,
      overrides: { showCoupon: true },
      updatedBy: { actor: 'system' }
    });

    const community = await getDomainConfigForAdmin('commercial', 'community');
    expect(community.effectiveConfig.showCoupon).toBeUndefined();
    expect(community.overrides.showCoupon).toBeUndefined();
    expect(community.revision).toBe(1);

    const pro = await getDomainConfigForAdmin('commercial', 'pro');
    expect(pro.effectiveConfig.showCoupon).toBe(true);
  });

  it('defaults the edition argument to the server-side authoritative detection', async () => {
    await MongoSystemInstanceConfig.create({
      _id: 'commercial',
      schemaVersion: 1,
      revision: 1,
      overrides: { showCoupon: true },
      updatedBy: { actor: 'system' }
    });

    // 不传 edition：测试环境无 PRO_URL，应等价于 community，商业字段被过滤
    const result = await getDomainConfigForAdmin('commercial');
    expect(result.effectiveConfig.showCoupon).toBeUndefined();
  });
});
