import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IframeHtml from '@/components/Markdown/components/IframeHtml';

vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Container = ({ children }: { children: React.ReactNode }) =>
    createElement('div', null, children);
  return {
    Box: Container,
    Flex: Container,
    HStack: Container,
    Text: Container,
    IconButton: (props: { 'aria-label': string; onClick: () => void }) =>
      createElement('button', { 'aria-label': props['aria-label'], onClick: props.onClick })
  };
});
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/hooks/useCopyData', () => ({ useCopyData: () => ({ copyData: vi.fn() }) }));
vi.mock('react-syntax-highlighter', () => ({ Prism: () => null }));
vi.mock('@/components/Markdown/utils/hooks', () => ({ useMarkdownWidth: () => ({ width: 800 }) }));
vi.mock('@/components/Markdown/components/CodeLight', () => ({ codeLight: {} }));

describe('IframeHtml', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    const dom = new JSDOM();
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    window.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the new tab on the same sandbox policy as the inline preview', async () => {
    const code = '<!doctype html><main title="今日 &amp; 明日">Today &quot;Tomorrow&quot;</main>';
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    const previewProps = {
      children: [code],
      codeBlock: true,
      match: /language-(\w+)/.exec('language-html'),
      autoPreviewHtmlCodeBlock: true
    };
    await act(async () => root.render(React.createElement(IframeHtml, previewProps)));

    const inlineFrame = container.querySelector('iframe');
    expect(inlineFrame?.getAttribute('srcdoc')).toBe(code);
    expect(inlineFrame?.getAttribute('sandbox')).toBe('allow-popups allow-scripts');
    expect(inlineFrame?.getAttribute('referrerpolicy')).toBe('no-referrer');

    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="common:open_in_new_tab"]')?.click()
    );

    expect(open).toHaveBeenCalledExactlyOnceWith('blob:preview', '_blank', 'noopener,noreferrer');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const previewBlob = createObjectURL.mock.calls[0][0];
    const { document: previewDocument } = new JSDOM(await previewBlob.text()).window;
    const newTabFrame = previewDocument.querySelector('iframe');
    expect(previewDocument.body.children).toHaveLength(1);
    expect(newTabFrame?.getAttribute('srcdoc')).toBe(code);
    expect(newTabFrame?.getAttribute('sandbox')).toBe(inlineFrame?.getAttribute('sandbox'));
    expect(newTabFrame?.getAttribute('referrerpolicy')).toBe(
      inlineFrame?.getAttribute('referrerpolicy')
    );

    vi.advanceTimersByTime(10000);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:preview');
  });
});
