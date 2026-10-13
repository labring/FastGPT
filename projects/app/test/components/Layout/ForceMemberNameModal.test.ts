import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ForceMemberNameModal from '@/components/Layout/ForceMemberNameModal';

const { mockUseSystemStore, mockFormModal, mockUseUserStore, mockClearToken, mockReplace } =
  vi.hoisted(() => ({
    mockUseSystemStore: vi.fn(),
    mockFormModal: vi.fn(),
    mockUseUserStore: vi.fn(),
    mockClearToken: vi.fn(),
    mockReplace: vi.fn()
  }));

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => mockUseSystemStore()
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => mockUseUserStore()
}));
vi.mock('@/web/support/user/auth', () => ({
  clearToken: () => mockClearToken()
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ replace: mockReplace })
}));
vi.mock('@/pageComponents/account/team/MemberNameForm', () => ({
  default: (props: unknown) => {
    mockFormModal(props);
    return null;
  }
}));

describe('强制补齐成员姓名', () => {
  beforeEach(() => {
    mockUseSystemStore.mockReset();
    mockFormModal.mockReset();
    mockUseUserStore.mockReset();
    mockClearToken.mockReset();
    mockReplace.mockReset();
    mockUseUserStore.mockReturnValue({ setUserInfo: vi.fn() });
    mockClearToken.mockResolvedValue(undefined);
    mockReplace.mockResolvedValue(true);
  });

  it('默认留空，不能一键确认账号或工号作为姓名', () => {
    mockUseSystemStore.mockReturnValue({ feConfigs: { teamMode: 'multi' } });
    renderToStaticMarkup(createElement(ForceMemberNameModal, { onSuccess: vi.fn() }));
    expect(mockFormModal).toHaveBeenCalledTimes(1);
    expect(mockFormModal.mock.calls[0][0]).toMatchObject({
      defaultName: '',
      dismissible: false,
      onExit: undefined,
      helperText: 'account_team:force_member_name_hint'
    });
  });

  it('外部同步模式下仍强制补齐，并提示管理员检查 SSO 姓名字段', () => {
    mockUseSystemStore.mockReturnValue({ feConfigs: { teamMode: 'sync' } });
    renderToStaticMarkup(createElement(ForceMemberNameModal, { onSuccess: vi.fn() }));
    expect(mockFormModal.mock.calls[0][0]).toMatchObject({
      defaultName: '',
      dismissible: false,
      helperText: 'account_team:force_member_name_sync_hint'
    });
  });

  it('外部同步失败时可退出登录而不提交姓名', async () => {
    const setUserInfo = vi.fn();
    mockUseUserStore.mockReturnValue({ setUserInfo });
    mockUseSystemStore.mockReturnValue({ feConfigs: { teamMode: 'sync' } });
    renderToStaticMarkup(createElement(ForceMemberNameModal, { onSuccess: vi.fn() }));
    const props = mockFormModal.mock.calls[0][0];
    expect(props.dismissible).toBe(false);
    expect(props.onExit).toEqual(expect.any(Function));
    await props.onExit();
    expect(mockClearToken).toHaveBeenCalledTimes(1);
    expect(setUserInfo).toHaveBeenCalledWith(null);
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('只在刷新确认已设置姓名时结束强制流程，未知状态继续保留', () => {
    const onSuccess = vi.fn();
    mockUseSystemStore.mockReturnValue({ feConfigs: { teamMode: 'sync' } });
    renderToStaticMarkup(createElement(ForceMemberNameModal, { onSuccess }));
    const { onSubmitted } = mockFormModal.mock.calls[0][0];
    onSubmitted(null);
    onSubmitted({ team: { isSetMemberName: false } });
    expect(onSuccess).not.toHaveBeenCalled();
    onSubmitted({ team: { isSetMemberName: true } });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});
