import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import type { TeamMemberItemType } from '@fastgpt/global/support/user/team/type';

const mocks = vi.hoisted(() => ({
  loadMembers: vi.fn(),
  updateGroup: vi.fn(),
  updateOrg: vi.fn(),
  toast: vi.fn(),
  userInfo: { team: { tmbId: 'owner', permission: { hasManagePer: true } } },
  candidates: [{ tmbId: 'candidate', memberName: 'Candidate', avatar: '' }]
}));

export const memberManagerMocks = mocks;

vi.mock('@/web/support/user/team/utils', () => ({ getAllTeamMembers: mocks.loadMembers }));
vi.mock('@/web/support/user/team/api', () => ({ getTeamMembers: vi.fn() }));
vi.mock('@/web/support/user/team/group/api', () => ({ putUpdateGroup: mocks.updateGroup }));
vi.mock('@/web/support/user/team/org/api', () => ({ putUpdateOrgMembers: mocks.updateOrg }));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: mocks.userInfo })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useScrollPagination', () => ({
  useScrollPagination: () => ({
    data: mocks.candidates,
    ScrollData: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', null, children)
  })
}));
vi.mock('@chakra-ui/react', () => {
  const Box = ({ children, onClick, onMouseEnter, onMouseLeave, role }: any) =>
    React.createElement('div', { onClick, onMouseEnter, onMouseLeave, role }, children);
  return {
    Box,
    Flex: Box,
    Grid: Box,
    HStack: Box,
    ModalBody: Box,
    ModalFooter: Box,
    Button: ({ children, onClick, isLoading, isDisabled }: any) =>
      React.createElement('button', { onClick, disabled: isLoading || isDisabled }, children)
  };
});
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children, onClose }: any) =>
    React.createElement(
      'div',
      null,
      React.createElement('button', { onClick: onClose }, 'close-modal'),
      children
    )
}));
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({ isLoading, children }: any) =>
    React.createElement('div', { 'data-loading': isLoading ? 'true' : 'false' }, children)
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ onClick, name }: any) =>
    React.createElement('button', { onClick, 'data-icon': name }, 'remove')
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Tag', () => ({
  default: ({ children, onClick }: any) => React.createElement('span', { onClick }, children)
}));
vi.mock('@fastgpt/web/components/common/Input/SearchInput', () => ({ default: () => null }));
vi.mock('@/components/support/permission/MemberManager/MemberItemCard', () => ({
  default: ({ name, onChange, isChecked }: any) =>
    React.createElement('button', { onClick: onChange, 'data-selected': String(isChecked) }, name)
}));

/** 提供真实 React/ahooks 环境，只替换展示组件和外部数据接口。 */
export const setupMemberManagerTest = () => {
  let root: Root;
  let container: HTMLDivElement;
  const pending: Array<{
    resolve: (members: TeamMemberItemType[]) => void;
    reject: (error: Error) => void;
    controller: AbortController;
  }> = [];

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    pending.length = 0;
    mocks.userInfo.team.tmbId = 'owner';
    mocks.userInfo.team.permission.hasManagePer = true;
    mocks.updateGroup.mockResolvedValue(undefined);
    mocks.updateOrg.mockResolvedValue(undefined);
    mocks.loadMembers.mockImplementation(
      (_params, controller) =>
        new Promise((resolve, reject) => pending.push({ resolve, reject, controller }))
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.unstubAllGlobals();
  });

  return {
    pending,
    render: async (element: React.ReactNode) => {
      await act(async () => root.render(element));
    },
    get container() {
      return container;
    },
    button: (text: string) =>
      Array.from(container.querySelectorAll('button')).find((node) => node.textContent === text),
    click: async (text: string) => {
      const button = Array.from(container.querySelectorAll('button')).find(
        (node) => node.textContent === text
      );
      expect(button).toBeDefined();
      await act(async () => button!.click());
    },
    resolve: async (index: number, members: TeamMemberItemType[]) => {
      await act(async () => pending[index].resolve(members));
    },
    reject: async (index: number) => {
      await act(async () => pending[index].reject(new Error('offline')));
    }
  };
};
