import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveTagForAppSubPanel } from '@/pageComponents/chat/ChatSetting/FavouriteAppSetting/TagManageModal';
import { getFavouriteApps, updateFavouriteAppTags } from '@/web/core/chat/api';

vi.mock('@/web/core/chat/api', () => ({
  getFavouriteApps: vi.fn(),
  updateFavouriteAppTags: vi.fn(),
  updateChatSetting: vi.fn()
}));
vi.mock('@/web/core/chat/context/chatPageContext', () => ({ ChatPageContext: {} }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@fastgpt/web/hooks/useRequest', async () => {
  const { useRequest } = await import('ahooks');
  return {
    useRequest: (service: any, options: any) => useRequest(service, { manual: true, ...options })
  };
});
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({ useConfirm: vi.fn() }));
vi.mock('@chakra-ui/icons', () => ({ AddIcon: () => null }));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/DndDrag', () => ({
  default: () => null,
  Draggable: () => null
}));
vi.mock('@chakra-ui/react', async () => {
  const { createElement, forwardRef } = await import('react');
  const Box = ({ children, onClick }: any) => createElement('div', { onClick }, children);
  return {
    Box,
    Flex: Box,
    VStack: Box,
    InputGroup: Box,
    InputLeftElement: Box,
    IconButton: () => null,
    Button: ({ children, onClick, isDisabled }: any) =>
      createElement('button', { onClick, disabled: isDisabled }, children),
    Input: forwardRef(({ name, onChange, onBlur }: any, ref: any) =>
      createElement('input', { name, onChange, onBlur, ref })
    ),
    Checkbox: ({ isChecked, isDisabled, onChange }: any) =>
      createElement('input', {
        type: 'checkbox',
        checked: isChecked,
        disabled: isDisabled,
        onChange
      }),
    useDisclosure: vi.fn()
  };
});

describe('SaveTagForAppSubPanel', () => {
  let root: Root;
  let container: HTMLDivElement;
  let commits: number;
  const pending: { resolve: (items: any[]) => void; reject: (error: Error) => void }[] = [];
  const onClose = vi.fn();
  const onRefresh = vi.fn().mockResolvedValue(undefined);
  const render = async () => {
    await act(async () =>
      root.render(
        React.createElement(
          React.Profiler,
          {
            id: 'favourites',
            onRender: () => {
              if (++commits > 30) throw new Error('Unbounded effect updates');
            }
          },
          React.createElement(SaveTagForAppSubPanel, {
            tag: { id: 'tag', name: 'Tag' },
            onClose,
            onRefresh
          })
        )
      )
    );
  };
  const favourite = { _id: 'fav', appId: 'app', name: 'App', avatar: '', favouriteTags: [] };
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    commits = 0;
    pending.length = 0;
    vi.mocked(getFavouriteApps).mockImplementation(
      () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
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

  it('keeps editing disabled until the complete list loads, then saves local edits', async () => {
    await render();
    await render();
    expect(getFavouriteApps).toHaveBeenCalledTimes(2);
    await act(async () => pending[0].resolve([favourite]));
    expect(container.querySelector('button')!.disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('[type=checkbox]')!.disabled).toBe(true);
    await act(async () => pending[1].resolve([favourite]));
    expect(container.querySelector('button')!.disabled).toBe(false);
    await act(async () =>
      Array.from(container.querySelectorAll('div'))
        .find((node) => node.textContent === 'App' && node.children.length === 0)!
        .click()
    );
    await render();
    expect(container.querySelector<HTMLInputElement>('[type=checkbox]')!.checked).toBe(true);
    await act(async () => container.querySelector('button')!.click());
    expect(updateFavouriteAppTags).toHaveBeenCalledWith([{ id: 'fav', tags: ['tag'] }]);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each(['empty', 'failure'])('settles without render loops for %s data', async (result) => {
    await render();
    await act(async () => {
      pending[0].resolve([]);
      if (result === 'empty') pending[1].resolve([]);
      else pending[1].reject(new Error('offline'));
    });
    await render();
    expect(getFavouriteApps).toHaveBeenCalledTimes(2);
    expect(container.querySelector('button')!.disabled).toBe(result === 'failure');
    expect(commits).toBeLessThan(15);
  });
});
