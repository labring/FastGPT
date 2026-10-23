// @vitest-environment jsdom

import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useResourceSelection } from '../../hooks/useResourceSelection';

type Resource = { _id: string; name: string };
type Selection = ReturnType<typeof useResourceSelection<Resource>>;

const Harness = ({
  resources,
  scopeKey,
  onState
}: {
  resources: Resource[];
  scopeKey: string;
  onState: (state: Selection) => void;
}) => {
  const state = useResourceSelection({ resources, scopeKey });
  useEffect(() => onState(state), [onState, state]);
  return state.selectedResource
    ? React.createElement('section', { 'data-testid': 'modal' }, state.selectedResource.name)
    : null;
};

describe('useResourceSelection', () => {
  it('keeps the modal and its latest snapshot when rebuilding pages or excluding the selected folder', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const onState = vi.fn<(state: Selection) => void>();
    const folder = { _id: 'folder', name: 'before' };
    const render = (resources: Resource[]) =>
      act(async () => {
        root.render(React.createElement(Harness, { resources, scopeKey: 'search', onState }));
      });

    await render([folder]);
    expect(onState.mock.lastCall?.[0].selectedResource).toBeUndefined();
    await act(async () => onState.mock.lastCall?.[0].selectResource(folder));
    const modal = host.querySelector('[data-testid="modal"]');
    const updatedFolder = { ...folder, name: 'after' };
    await render([updatedFolder]);
    expect(onState.mock.lastCall?.[0].selectedResource).toBe(updatedFolder);
    await render([]);
    await render([{ _id: 'first-page', name: 'other resource' }]);

    expect(host.querySelector('[data-testid="modal"]')).toBe(modal);
    expect(modal?.textContent).toBe('after');
    expect(onState.mock.lastCall?.[0].selectedResource).toBe(updatedFolder);
    await act(async () => onState.mock.lastCall?.[0].selectResource());
    expect(host.querySelector('[data-testid="modal"]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('clears selection across query changes without reopening it when returning to the old query', async () => {
    const root = createRoot(document.createElement('div'));
    const onState = vi.fn<(state: Selection) => void>();
    const folder = { _id: 'folder', name: 'folder' };
    const render = (scopeKey: string) =>
      act(async () => {
        root.render(React.createElement(Harness, { resources: [folder], scopeKey, onState }));
      });

    await render('first-directory');
    await act(async () => onState.mock.lastCall?.[0].selectResource(folder));
    await render('second-directory');
    expect(onState.mock.lastCall?.[0].selectedResource).toBeUndefined();
    await render('first-directory');
    expect(onState.mock.lastCall?.[0].selectedResource).toBeUndefined();
    await act(async () => root.unmount());
  });
});
