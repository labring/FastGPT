import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAppBasicInfoByIds } from '@/web/core/app/api';
import { useQuickAppInfo } from '@/pageComponents/chat/ChatSetting/HomepageSetting/useQuickAppInfo';

vi.mock('@/web/core/app/api', () => ({ getAppBasicInfoByIds: vi.fn() }));

describe('useQuickAppInfo', () => {
  let root: Root;
  let container: HTMLDivElement;
  let state: ReturnType<typeof useQuickAppInfo>;
  const pending: {
    resolve: (items: Awaited<ReturnType<typeof getAppBasicInfoByIds>>) => void;
    reject: (error: Error) => void;
  }[] = [];
  const Harness = ({ ids }: { ids: string[] }) => {
    state = useQuickAppInfo(ids);
    return null;
  };
  const render = async (ids: string[]) => {
    await act(async () => root.render(React.createElement(Harness, { ids })));
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    pending.length = 0;
    vi.mocked(getAppBasicInfoByIds).mockImplementation(
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

  it('does not request empty selections or duplicate in-flight IDs', async () => {
    await render([]);
    expect(getAppBasicInfoByIds).not.toHaveBeenCalled();
    await render(['a', 'a']);
    await render(['a']);
    await render(['a', 'b']);
    expect(vi.mocked(getAppBasicInfoByIds).mock.calls).toEqual([[['a']], [['b']]]);
  });

  it('remembers missing IDs after a partial response without triggering more requests', async () => {
    await render(['a', 'deleted']);
    await act(async () => pending[0].resolve([{ id: 'a', name: 'A', avatar: '' }]));
    await render(['deleted', 'a']);
    expect(state.selectedInfo).toEqual({ a: { _id: 'a', name: 'A', avatar: '' } });
    expect(getAppBasicInfoByIds).toHaveBeenCalledTimes(1);
    await render([]);
    await render(['a', 'deleted']);
    expect(getAppBasicInfoByIds).toHaveBeenCalledTimes(1);
  });

  it.each(['empty', 'failure'])('stops automatic retries after %s', async (result) => {
    await render(['a']);
    await act(async () => {
      if (result === 'empty') pending[0].resolve([]);
      else pending[0].reject(new Error('offline'));
    });
    await render([]);
    await render(['a']);
    expect(state.selectedInfo).toEqual({});
    expect(getAppBasicInfoByIds).toHaveBeenCalledTimes(1);
  });

  it('keeps manually cached information when an older response arrives', async () => {
    await render(['a']);
    await act(async () => state.cacheApp({ _id: 'a', name: 'new', avatar: 'new.png' }));
    await act(async () => pending[0].resolve([{ id: 'a', name: 'old', avatar: '' }]));
    expect(state.selectedInfo.a.name).toBe('new');
    await act(async () => state.cacheApp({ _id: 'b', name: 'B', avatar: '' }));
    await render(['a', 'b']);
    expect(getAppBasicInfoByIds).toHaveBeenCalledTimes(1);
  });

  it('retains cache after deselection without reselecting an ID', async () => {
    const ids: string[] = [];
    await render(['a']);
    await render(ids);
    await act(async () => pending[0].resolve([{ id: 'a', name: 'A', avatar: '' }]));
    expect(ids).toEqual([]);
    await render(['a']);
    expect(state.selectedInfo.a.name).toBe('A');
    expect(getAppBasicInfoByIds).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'failure'])(
    'ignores late %s responses after close and retries on reopen',
    async (result) => {
      await render(['a']);
      await act(async () => root.render(null));
      await act(async () => {
        if (result === 'success') pending[0].resolve([{ id: 'a', name: 'old', avatar: '' }]);
        else pending[0].reject(new Error('offline'));
      });
      await render(['a']);
      expect(state.selectedInfo).toEqual({});
      expect(getAppBasicInfoByIds).toHaveBeenCalledTimes(2);
      await act(async () => pending[1].resolve([{ id: 'a', name: 'new', avatar: '' }]));
      expect(state.selectedInfo.a.name).toBe('new');
    }
  );

  it('replays mount effects safely in StrictMode', async () => {
    await act(async () =>
      root.render(
        React.createElement(React.StrictMode, null, React.createElement(Harness, { ids: ['a'] }))
      )
    );
    await act(async () => pending[0].resolve([{ id: 'a', name: 'old', avatar: '' }]));
    expect(state.selectedInfo).toEqual({});
    await act(async () => pending[1].resolve([{ id: 'a', name: 'new', avatar: '' }]));
    expect(state.selectedInfo.a.name).toBe('new');
  });
});
