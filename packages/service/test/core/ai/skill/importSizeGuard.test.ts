import { describe, expect, it } from 'vitest';
import { getSkillImportMaxBytes } from '@fastgpt/global/common/file/tools';

/**
 * 回归：导入技能时，超限压缩包必须在上传前被拦下，而不是被送进导入流程后超时。
 *
 * 关联 bug：测试环境配置了 10MB 通用上传上限（uploadFileMaxSize），但导入技能只看
 * skillSandboxMaxBytes（默认 AGENT_SANDBOX_DISK_MB=1024 → 512MB），完全忽略 10MB，
 * 导致 29.29MB 仍可导入，最终 60s 超时。
 *
 * 修复：前后端共用 getSkillImportMaxBytes = min(uploadFileMaxSize, skillSandboxMaxBytes)。
 * 本测试直接覆盖该真实函数（非复制逻辑）。
 */
const MB = 1024 * 1024;
// 默认 AGENT_SANDBOX_DISK_MB=1024 时 getAgentSandboxSkillMaxBytes() = 512MB
const SANDBOX_512MB = 512 * MB;

/** 忠实复刻 ImportSkillModal.tsx 的「是否放行」判定（接受 = 非超限）。 */
const isAccepted = (fileSize: number, maxBytes: number | undefined): boolean =>
  !(typeof maxBytes === 'number' && fileSize > maxBytes);

describe('getSkillImportMaxBytes — 导入技能有效上限', () => {
  it('修复：运营 10MB 上传上限下，29.29MB 必须被拒绝（旧逻辑只用 512MB 会放行 → 即 bug）', () => {
    // 旧 ImportSkillModal 直接用 skillSandboxMaxBytes(512MB) → 29.29MB 被放行（bug 现象）
    expect(isAccepted(Math.round(29.29 * MB), SANDBOX_512MB)).toBe(true);

    // 新：取 min(10MB, 512MB) = 10MB → 29.29MB 被拒绝
    const effective = getSkillImportMaxBytes(10, SANDBOX_512MB);
    expect(effective).toBe(10 * MB);
    expect(isAccepted(Math.round(29.29 * MB), effective)).toBe(false);
  });

  it('边界一致：恰好等于有效上限（10MB）放行，前后端均用「>」严格判定', () => {
    const effective = getSkillImportMaxBytes(10, SANDBOX_512MB);
    expect(isAccepted(10 * MB, effective)).toBe(true); // 边界值放行
    expect(isAccepted(10 * MB + 1, effective)).toBe(false); // 刚超 1 字节即拒绝
  });

  it('合法小文件仍可正常导入', () => {
    const effective = getSkillImportMaxBytes(10, SANDBOX_512MB);
    expect(isAccepted(1 * MB, effective)).toBe(true);
    expect(isAccepted(9.99 * MB, effective)).toBe(true);
  });

  it('上传上限缺失时回退到沙盒包上限（不弱于原有行为）', () => {
    expect(getSkillImportMaxBytes(undefined, SANDBOX_512MB)).toBe(SANDBOX_512MB);
  });

  it('防回归：上传上限大于沙盒包上限时取沙盒值，导入不得超过运行时可加载大小', () => {
    // 默认 uploadFileMaxSize=1000MB > 沙盒 512MB → 有效上限=512MB，
    // 避免「能导入却在运行时加载失败」的新回归。
    expect(getSkillImportMaxBytes(1000, SANDBOX_512MB)).toBe(SANDBOX_512MB);
  });
});
