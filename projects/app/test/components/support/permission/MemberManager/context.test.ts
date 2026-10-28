import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextSelector } from 'use-context-selector';
import CollaboratorContextProvider, {
  CollaboratorContext
} from '@/components/support/permission/MemberManager/context';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorListType } from '@fastgpt/global/support/permission/collaborator';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({
  useToast: () => ({ toast: vi.fn() })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { isPlus: true } })
}));
vi.mock('@fastgpt/web/components/common/LightTip', () => ({ default: () => null }));
vi.mock('@/components/support/permission/MemberManager/MemberListCard', () => ({
  default: function MemberList() {
    const { collaboratorList, isLoadingCollaborator } = useContextSelector(
      CollaboratorContext,
      (v) => v
    );
    return React.createElement(
      'output',
      { 'data-loading': String(isLoadingCollaborator) },
      collaboratorList.map((member) => member.name).join(',')
    );
  }
}));
vi.mock('next/dynamic', () => ({
  default: () =>
    function MemberModal({ onClose }: { onClose: () => void }) {
      const updateCollaborators = useContextSelector(
        CollaboratorContext,
        (v) => v.onUpdateCollaborators
      );
      return React.createElement(
        'section',
        { 'data-testid': 'member-modal' },
        React.createElement('button', { onClick: onClose }, 'cancel'),
        React.createElement(
          'button',
          {
            onClick: () => {
              // 模拟管理弹窗的保存约定：写入成功才关闭，失败时允许重试。
              updateCollaborators({ collaborators: [] })
                .then(onClose)
                .catch(() => {});
            }
          },
          'save'
        )
      );
    }
}));

/** 构造接口返回的权限快照，校验 Provider 会转换成可供界面读取的 Permission。 */
const collaborators = (name: string): CollaboratorListType => ({
  clbs: [
    {
      tmbId: 'member',
      teamId: 'team',
      name,
      avatar: '',
      permission: new Permission({ role: ReadRoleVal })
    }
  ]
});

describe('CollaboratorContextProvider', () => {
  let root: Root;
  let host: HTMLDivElement;
  let dom: JSDOM;
  const getCollaborators = vi.fn<() => Promise<CollaboratorListType>>();
  const updateCollaborators = vi.fn();
  const deleteCollaborator = vi.fn();
  const refetchResource = vi.fn();

  beforeEach(() => {
    // App 的全局 setup 会初始化服务端环境，DOM 必须在 setup 完成后再安装。
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    getCollaborators.mockReset().mockResolvedValue(collaborators('before'));
    updateCollaborators.mockReset().mockResolvedValue(undefined);
    deleteCollaborator.mockReset().mockResolvedValue(undefined);
    refetchResource.mockReset().mockResolvedValue(undefined);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const render = async () => {
    const props: React.ComponentProps<typeof CollaboratorContextProvider> = {
      permission: new Permission(),
      defaultRole: ReadRoleVal,
      onGetCollaboratorList: getCollaborators,
      onUpdateCollaborators: updateCollaborators,
      onDelOneCollaborator: deleteCollaborator,
      refetchResource,
      children: ({ onOpenManageModal, MemberListCard }) =>
        React.createElement(
          'section',
          { 'data-testid': 'permission-modal' },
          React.createElement('button', { onClick: onOpenManageModal }, 'manage'),
          React.createElement(MemberListCard),
          React.createElement(DeleteButton)
        )
    };
    await act(async () => {
      root.render(React.createElement(CollaboratorContextProvider, props));
    });
  };
  const click = async (text: string) => {
    const button = [...host.querySelectorAll('button')].find((node) => node.textContent === text);
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };

  it('closes without refreshing when collaborator edits are cancelled', async () => {
    await render();
    const permissionModal = host.querySelector('[data-testid="permission-modal"]');
    await click('manage');
    await click('cancel');

    expect(host.querySelector('[data-testid="member-modal"]')).toBeNull();
    expect(host.querySelector('[data-testid="permission-modal"]')).toBe(permissionModal);
    expect(getCollaborators).toHaveBeenCalledOnce();
    expect(refetchResource).not.toHaveBeenCalled();
  });

  it('refreshes in the background after saving and keeps the previous collaborators visible', async () => {
    await render();
    const permissionModal = host.querySelector('[data-testid="permission-modal"]');
    let resolveRefresh!: (value: CollaboratorListType) => void;
    getCollaborators.mockImplementationOnce(
      () => new Promise((resolve) => (resolveRefresh = resolve))
    );
    // 后台刷新失败不应让已成功的保存再次失败或阻止关闭。
    refetchResource.mockRejectedValueOnce(new Error('offline'));
    await click('manage');
    await click('save');

    expect(updateCollaborators).toHaveBeenCalledOnce();
    expect(refetchResource).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-testid="member-modal"]')).toBeNull();
    expect(host.querySelector('[data-testid="permission-modal"]')).toBe(permissionModal);
    expect(host.querySelector('output')?.textContent).toBe('before');
    expect(host.querySelector('output')?.getAttribute('data-loading')).toBe('false');

    await act(async () => resolveRefresh(collaborators('after')));
    expect(host.querySelector('output')?.textContent).toBe('after');
  });

  it('keeps the editor open on a failed save and refreshes after a successful retry', async () => {
    await render();
    updateCollaborators.mockRejectedValueOnce(new Error('save failed'));
    await click('manage');
    await click('save');

    expect(host.querySelector('[data-testid="member-modal"]')).not.toBeNull();
    expect(getCollaborators).toHaveBeenCalledOnce();
    expect(refetchResource).not.toHaveBeenCalled();

    await click('save');
    expect(host.querySelector('[data-testid="member-modal"]')).toBeNull();
    expect(refetchResource).toHaveBeenCalledOnce();
  });

  it('synchronizes the resource after deleting a collaborator outside the editor', async () => {
    await render();
    await click('delete');

    expect(deleteCollaborator).toHaveBeenCalledWith({ tmbId: 'member' });
    expect(getCollaborators).toHaveBeenCalledTimes(2);
    expect(refetchResource).toHaveBeenCalledOnce();
  });
});

const DeleteButton = () => {
  const onDelete = useContextSelector(CollaboratorContext, (v) => v.onDelOneCollaborator);
  return React.createElement(
    'button',
    { onClick: () => onDelete?.({ tmbId: 'member' }) },
    'delete'
  );
};
