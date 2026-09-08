/**
 * License 验证核心（决策版）测试 — 见飞书决策版 §2/§3
 * 验证：旧 license（schemaVersion=1）归一化映射、functions 默认关闭、实例 ID 透传、
 * 有效期判定（startTime <= now < expiredTime）。
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeLicenseData,
  isLicenseExpired
} from '@fastgpt/service/common/system/license/verify';

describe('normalizeLicenseData（旧 license → 决策版结构）', () => {
  it('旧结构（schemaVersion=1 + 顶层配额 + batchEval）归一化为决策版结构', () => {
    const raw = {
      startTime: '2026-01-01T00:00:00.000Z',
      expiredTime: '2027-01-01T00:00:00.000Z',
      company: '测试公司',
      hosts: ['admin.example.com'],
      maxUsers: 100,
      maxApps: 10,
      maxDatasets: 5,
      functions: {
        sso: true,
        pay: false,
        customTemplates: true,
        datasetEnhance: true,
        batchEval: true
      }
    };

    const data = normalizeLicenseData(raw);

    expect(data.schemaVersion).toBe(1); // 旧 license 保留 schemaVersion=1
    expect(data.licenseType).toBe('official'); // 缺省 official
    expect(data.limits).toEqual({ maxUsers: 100, maxApps: 10, maxDatasets: 5 });
    expect(data.functions.eval).toBe(true); // batchEval → eval
    expect(data.functions.assistantGenerate).toBe(false); // 缺失补默认关
    expect(data.functions.portal).toBe(false);
    expect(data.functions.sandboxSkills).toBe(false);
    // deprecated 兼容视图
    expect(data.functions.batchEval).toBe(true);
    expect(data.functions.customTemplates).toBe(false); // 已移除功能不入新结构
    expect(data.maxUsers).toBe(100);
    expect(data.hosts).toEqual(['admin.example.com']);
  });

  it('决策版新结构（schemaVersion=2 + limits + 全 functions）透传', () => {
    const raw = {
      schemaVersion: 2,
      licenseType: 'trial',
      startTime: '2026-06-01T00:00:00.000Z',
      expiredTime: '2026-09-01T00:00:00.000Z',
      company: '新客户',
      instanceId: 'a'.repeat(32),
      limits: { maxUsers: 0, maxApps: 0, maxDatasets: 0 },
      functions: {
        sso: true,
        pay: true,
        eval: true,
        datasetEnhance: true,
        assistantGenerate: true,
        portal: false,
        sandboxSkills: false
      }
    };

    const data = normalizeLicenseData(raw);

    expect(data.schemaVersion).toBe(2);
    expect(data.licenseType).toBe('trial');
    expect(data.instanceId).toBe('a'.repeat(32));
    expect(data.limits).toEqual({ maxUsers: 0, maxApps: 0, maxDatasets: 0 });
    expect(data.functions.eval).toBe(true);
    expect(data.functions.portal).toBe(false);
  });

  it('无 functions 时全部默认关闭', () => {
    const data = normalizeLicenseData({
      startTime: '2026-01-01T00:00:00.000Z',
      expiredTime: '2027-01-01T00:00:00.000Z',
      company: 'x'
    });
    expect(data.functions.sso).toBe(false);
    expect(data.functions.pay).toBe(false);
    expect(data.functions.eval).toBe(false);
    expect(data.functions.datasetEnhance).toBe(false);
    expect(data.functions.assistantGenerate).toBe(false);
    expect(data.functions.portal).toBe(false);
    expect(data.functions.sandboxSkills).toBe(false);
    expect(data.limits).toEqual({ maxUsers: 0, maxApps: 0, maxDatasets: 0 });
  });
});

describe('isLicenseExpired（决策版有效期：startTime <= now < expiredTime）', () => {
  const base = { startTime: '2026-01-01T00:00:00.000Z', expiredTime: '2026-12-31T00:00:00.000Z' };

  it('有效期内不过期', () => {
    expect(isLicenseExpired(base, new Date('2026-06-01T00:00:00.000Z'))).toBe(false);
  });

  it('未到 startTime 视为过期（未生效）', () => {
    expect(isLicenseExpired(base, new Date('2025-12-01T00:00:00.000Z'))).toBe(true);
  });

  it('达到 expiredTime 视为过期（含边界）', () => {
    expect(isLicenseExpired(base, new Date('2026-12-31T00:00:00.000Z'))).toBe(true);
    expect(isLicenseExpired(base, new Date('2027-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('startTime 边界：恰好等于 startTime 视为生效', () => {
    expect(isLicenseExpired(base, new Date('2026-01-01T00:00:00.000Z'))).toBe(false);
  });
});
