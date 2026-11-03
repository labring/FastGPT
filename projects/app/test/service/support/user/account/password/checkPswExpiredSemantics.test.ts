import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEAF_ABSENT_SNAPSHOT } from '@test/utils/instanceConfigSnapshot';

// checkPswExpired 的核心语义在"快照叶子值"而非 env：
// 生产快照由 schema 默认值填满（auth.passwordExpiredMonth 恒为 number|null），
// 即使测试种子缺失叶子，运行期也不能读回旧 ENV。
const setSnapshotPasswordExpiredMonth = (value: number | null | undefined) => {
  const snapshot = LEAF_ABSENT_SNAPSHOT() as any;
  snapshot.auth.passwordExpiredMonth = value;
  (global as any).systemInstanceConfig = snapshot;
};

const loadCheckPswExpired = async () => {
  vi.resetModules();
  return import('@/service/support/user/account/password').then((m) => m.checkPswExpired);
};

describe('checkPswExpired instance-config semantics', () => {
  afterEach(() => {
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', undefined);
  });

  it('snapshot null means never expire even when env is configured', async () => {
    // 生产语义：管理员显式"永不过期"落库 null，不能被 env 初值复活
    setSnapshotPasswordExpiredMonth(null);
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', '3');

    const checkPswExpired = await loadCheckPswExpired();
    expect(checkPswExpired({ updateTime: new Date(Date.now() - 400 * 24 * 3600 * 1000) })).toBe(
      false
    );
    // 缺 updateTime 时"永不过期"同样成立，不得强制改密
    expect(checkPswExpired({ updateTime: undefined })).toBe(false);
  });

  it('snapshot number takes precedence over env', async () => {
    setSnapshotPasswordExpiredMonth(1);
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', '12');

    const checkPswExpired = await loadCheckPswExpired();
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    expect(checkPswExpired({ updateTime: twoMonthsAgo })).toBe(true);
  });

  it('does not revive ENV when a test snapshot omits the leaf', async () => {
    setSnapshotPasswordExpiredMonth(undefined);
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', '1');

    const checkPswExpired = await loadCheckPswExpired();
    const twoMonthsAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000);
    expect(checkPswExpired({ updateTime: twoMonthsAgo })).toBe(false);
    expect(checkPswExpired({ updateTime: new Date() })).toBe(false);
  });

  it('explicit config zero means never expire regardless of ENV', async () => {
    // 旧 env 语义 PASSWORD_EXPIRED_MONTH=0 同样是永不过期：必须先归一再判断，
    // 否则缺 updateTime 的用户会被强制改密，与 null 分支矛盾
    setSnapshotPasswordExpiredMonth(0);
    vi.stubEnv('PASSWORD_EXPIRED_MONTH', '1');

    const checkPswExpired = await loadCheckPswExpired();
    expect(checkPswExpired({ updateTime: undefined })).toBe(false);
    expect(checkPswExpired({ updateTime: new Date(Date.now() - 9999 * 24 * 3600 * 1000) })).toBe(
      false
    );
  });

  it('undefined env keeps default never-expire behavior', async () => {
    setSnapshotPasswordExpiredMonth(undefined);

    const checkPswExpired = await loadCheckPswExpired();
    expect(checkPswExpired({ updateTime: new Date(0) })).toBe(false);
  });
});
