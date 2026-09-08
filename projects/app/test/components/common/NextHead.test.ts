import React, { type ReactNode } from 'react';
import ReactDOMServer from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import NextHead from '@/components/common/NextHead';

vi.mock('next/head', () => ({
  default: ({ children }: { children: ReactNode }) => children
}));

const renderHead = (icon: string) => {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(NextHead, { title: 'Dashboard', icon })
  );
};

describe('NextHead', () => {
  it('restores dashboard favicon after leaving editor', () => {
    expect(renderHead('/editor-avatar.png')).toContain('href="/editor-avatar.png"');
    expect(renderHead('/')).toContain('href="/favicon.ico"');
  });
});
