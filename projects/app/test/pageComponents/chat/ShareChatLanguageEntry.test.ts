import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
}));

vi.mock('@/pageComponents/chat/LanguageSelector', () => ({
  default: ({ mode }: { mode: string }) =>
    React.createElement('button', { 'data-language-mode': mode }, 'Language')
}));

import ShareChatLanguageEntry from '@/pageComponents/chat/ShareChatLanguageEntry';

const render = (props: React.ComponentProps<typeof ShareChatLanguageEntry>) =>
  renderToStaticMarkup(React.createElement(ShareChatLanguageEntry, props));

describe('ShareChatLanguageEntry', () => {
  it('keeps a share-mode language selector when history is hidden', () => {
    expect(render({ showHistory: '0', showHead: '1', isPlugin: false })).toContain(
      'data-language-mode="share"'
    );
  });

  it('does not duplicate the language selector when history is visible', () => {
    expect(render({ showHistory: '1', showHead: '1', isPlugin: false })).toBe('');
  });

  it('preserves intentionally hidden headers', () => {
    expect(render({ showHistory: '0', showHead: '0', isPlugin: false })).toBe('');
  });

  it('preserves plugin views', () => {
    expect(render({ showHistory: '0', showHead: '1', isPlugin: true })).toBe('');
  });
});
