import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ForceMemberNameModal from '@/components/Layout/ForceMemberNameModal';

const { mockUseSystemStore, mockFormModal } = vi.hoisted(() => ({
  mockUseSystemStore: vi.fn(),
  mockFormModal: vi.fn()
}));

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => mockUseSystemStore()
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
  });

  it('默认留空，不能一键确认账号或工号作为姓名', () => {
    mockUseSystemStore.mockReturnValue({ feConfigs: { teamMode: 'multi' } });
    renderToStaticMarkup(createElement(ForceMemberNameModal, { onSuccess: vi.fn() }));
    expect(mockFormModal).toHaveBeenCalledTimes(1);
    expect(mockFormModal.mock.calls[0][0]).toMatchObject({
      defaultName: '',
      dismissible: false,
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
});
