import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ batch: vi.fn() }));
vi.mock('@/web/core/ai/model/collaboratorApi', () => ({ getBatchModelCollaborators: api.batch }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: (selector: (state: unknown) => unknown) =>
    selector({ feConfigs: { isPlus: true } })
}));
vi.mock('@/web/support/user/useUserStore', async () => {
  const { create } = await import('@fastgpt/web/common/zustand');
  return { useUserStore: create(() => ({ userInfo: { team: { tmbId: 'member-a' } } })) };
});
import { useUserStore } from '@/web/support/user/useUserStore';
import {
  clearModelCollaboratorsCache,
  updateModelCollaboratorsCache,
  useModelCollaborators
} from '@/web/core/ai/model/useModelCollaborators';

let root: Root;
const Cell = ({ id }: { id: string }) => {
  const { clbs, failed } = useModelCollaborators(id);
  return React.createElement(
    'span',
    null,
    failed ? 'failed' : clbs ? JSON.stringify(clbs) : 'loading'
  );
};
beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  api.batch.mockReset().mockResolvedValue({ model: { clbs: [] } });
  useUserStore.setState({ userInfo: { team: { tmbId: 'member-a' } } } as never);
  clearModelCollaboratorsCache();
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const tick = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(20);
  });

describe('mounted collaborator cells', () => {
  it('reloads after invalidation without remounting the cell', async () => {
    act(() => root.render(React.createElement(Cell, { id: 'model' })));
    await tick();
    expect(document.body.textContent).toBe('[]');
    api.batch.mockResolvedValueOnce({ model: { clbs: [{ name: 'New collaborator' }] } });
    act(() => clearModelCollaboratorsCache());
    expect(document.body.textContent).toBe('loading');
    await tick();
    expect(api.batch).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain('New collaborator');
  });
  it('batches duplicate mounted cells into one request', async () => {
    act(() =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Cell, { id: 'model' }),
          React.createElement(Cell, { id: 'model' })
        )
      )
    );
    await tick();
    expect(api.batch).toHaveBeenCalledOnce();
    expect(api.batch).toHaveBeenCalledWith(['model']);
  });
  it('distinguishes a failed read from empty permissions and retries on invalidation', async () => {
    api.batch.mockRejectedValueOnce(new Error('network unavailable'));
    act(() => root.render(React.createElement(Cell, { id: 'model' })));
    await tick();
    expect(document.body.textContent).toBe('failed');
    expect(api.batch).toHaveBeenCalledOnce();
    act(() => clearModelCollaboratorsCache('model'));
    await tick();
    expect(document.body.textContent).toBe('[]');
  });
  it('does not overwrite an edited cache entry with a late batch response', async () => {
    let finish!: (value: unknown) => void;
    api.batch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    act(() => root.render(React.createElement(Cell, { id: 'model' })));
    await tick();
    act(() => updateModelCollaboratorsCache('model', []));
    await act(async () => {
      finish({ model: { clbs: [{ name: 'Outdated permissions' }] } });
    });
    expect(document.body.textContent).toBe('[]');
  });
  it('discards a late response after identity changes and loads the new identity', async () => {
    let finishOld!: (value: unknown) => void;
    api.batch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOld = resolve;
        })
    );
    act(() => root.render(React.createElement(Cell, { id: 'model' })));
    await tick();
    act(() => useUserStore.setState({ userInfo: { team: { tmbId: 'member-b' } } } as never));
    api.batch.mockResolvedValueOnce({ model: { clbs: [{ name: 'New identity' }] } });
    await tick();
    await act(async () => {
      finishOld({ model: { clbs: [{ name: 'Old identity' }] } });
    });
    expect(document.body.textContent).toContain('New identity');
    expect(document.body.textContent).not.toContain('Old identity');
  });
});
