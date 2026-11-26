// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../components/common/Textarea/PromptEditor/index.module.scss', () => ({
  default: {
    contentEditable: 'contentEditable',
    contentEditable_disabled: 'contentEditable_disabled',
    contentEditable_invalid: 'contentEditable_invalid',
    richText: 'richText'
  }
}));

import Editor from '../../../../../components/common/Textarea/PromptEditor/Editor';

describe('PromptEditor Editor external value sync', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('remounts and clears content when external value transitions empty -> text -> empty', async () => {
    const onChange = vi.fn();

    await act(async () => {
      root.render(React.createElement(Editor, { value: '', onChange, onChangeText: vi.fn() }));
    });
    expect(container.querySelector('[contenteditable]')?.textContent).toBe('');

    await act(async () => {
      root.render(React.createElement(Editor, { value: 'SS', onChange, onChangeText: vi.fn() }));
    });
    expect(container.querySelector('[contenteditable]')?.textContent).toBe('SS');

    await act(async () => {
      root.render(React.createElement(Editor, { value: '', onChange, onChangeText: vi.fn() }));
    });
    expect(container.querySelector('[contenteditable]')?.textContent).toBe('');
  });
});
