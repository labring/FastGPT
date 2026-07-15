import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';

import {
  rehypeStreamAnimated,
  type StreamAnimatedRuntime
} from '@/components/Markdown/rehypeStreamAnimated';

type TestNode =
  | {
      type: 'root';
      children: TestNode[];
    }
  | {
      type: 'element';
      tagName: string;
      properties?: Record<string, unknown>;
      children: TestNode[];
    }
  | {
      type: 'text';
      value: string;
    };

const text = (value: string): TestNode => ({ type: 'text', value });
const element = (tagName: string, children: TestNode[], properties?: Record<string, unknown>) => ({
  type: 'element' as const,
  tagName,
  ...(properties ? { properties } : {}),
  children
});
const root = (children: TestNode[]) => ({ type: 'root' as const, children });

const getElementsByTagName = (node: TestNode, tagName: string): TestNode[] => {
  if (node.type === 'text') return [];

  return [
    ...(node.type === 'element' && node.tagName === tagName ? [node] : []),
    ...node.children.flatMap((child) => getElementsByTagName(child, tagName))
  ];
};

const getStreamCharacters = (node: TestNode) =>
  getElementsByTagName(node, 'span').filter(
    (item) =>
      item.type === 'element' &&
      typeof item.properties?.className === 'string' &&
      item.properties.className.includes('stream-char')
  );

const getText = (node: TestNode): string => {
  if (node.type === 'text') return node.value;
  return node.children.map(getText).join('');
};

const createRuntime = (births: number[]): StreamAnimatedRuntime => ({ births, styles: [] });

describe('rehypeStreamAnimated', () => {
  it('should render stable character spans through markdown', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReactMarkdown,
        {
          rehypePlugins: [
            [
              rehypeStreamAnimated,
              {
                fadeDuration: 180,
                nowMs: 100,
                runtime: createRuntime([100, 102, 104, 106, 108])
              }
            ]
          ]
        },
        'hello'
      )
    );

    expect(html).toContain('<span class="stream-char" style="animation-delay:0ms">h</span>');
    expect(html).toContain('<span class="stream-char" style="animation-delay:8ms">o</span>');
    expect(html).not.toContain('stream-tail');
  });

  it('should freeze a character style after its first render', () => {
    const runtime = createRuntime([100, 110]);
    const firstTree = root([element('p', [text('ab')])]);
    const secondTree = root([element('p', [text('ab')])]);

    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 120, runtime })(firstTree as any);
    const firstStyles = [...runtime.styles];
    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 170, runtime })(secondTree as any);

    expect(runtime.styles).toEqual(firstStyles);
    expect(runtime.styles).toEqual(['animation-delay:-20ms', 'animation-delay:-10ms']);
  });

  it('should permanently reveal a cached character after its fade completes', () => {
    const runtime = createRuntime([100]);
    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 120, runtime })(
      root([element('p', [text('a')])]) as any
    );

    const tree = root([element('p', [text('a')])]);
    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 300, runtime })(tree as any);

    expect(runtime.styles).toEqual([null]);
    expect(getStreamCharacters(tree)[0]).toMatchObject({
      properties: { className: 'stream-char stream-char-revealed' }
    });
  });

  it('should render characters that already finished fading without animation', () => {
    const tree = root([element('p', [text('done')])]);

    rehypeStreamAnimated({
      fadeDuration: 180,
      nowMs: 500,
      runtime: createRuntime([100, 100, 100, 100])
    })(tree as any);

    const spans = getStreamCharacters(tree);
    expect(spans).toHaveLength(4);
    spans.forEach((span) => {
      expect(span).toMatchObject({
        properties: { className: 'stream-char stream-char-revealed' }
      });
    });
  });

  it('should keep list character positions stable without double wrapping nested paragraphs', () => {
    const tree = root([
      element('ul', [
        element('li', [text('first')]),
        element('li', [element('p', [text('second')])])
      ])
    ]);

    rehypeStreamAnimated({
      fadeDuration: 180,
      nowMs: 100,
      runtime: createRuntime(Array.from({ length: 11 }, () => 100))
    })(tree as any);

    const spans = getStreamCharacters(tree);
    expect(spans).toHaveLength(11);
    expect(spans.map(getText).join('')).toBe('firstsecond');
    expect(getElementsByTagName(spans[0], 'span')).toHaveLength(1);
  });

  it('should preserve inline markup while assigning one global character index', () => {
    const tree = root([element('p', [text('a'), element('strong', [text('bc')]), text('d')])]);
    const runtime = createRuntime([100, 110, 120, 130]);

    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(tree as any);

    expect(getStreamCharacters(tree).map(getText)).toEqual(['a', 'b', 'c', 'd']);
    expect(runtime.styles).toEqual([
      'animation-delay:0ms',
      'animation-delay:10ms',
      'animation-delay:20ms',
      'animation-delay:30ms'
    ]);
  });

  it.each([
    element('code', [text('code')]),
    element('table', [element('tbody', [element('tr', [element('td', [text('cell')])])])]),
    element('svg', [text('svg')]),
    element('span', [text('formula')], { className: ['katex'] })
  ])('should not wrap skipped content', (skippedContent) => {
    const tree = root([element('p', [text('before'), skippedContent, text('after')])]);

    rehypeStreamAnimated({
      fadeDuration: 180,
      nowMs: 100,
      runtime: createRuntime(Array.from({ length: 11 }, () => 100))
    })(tree as any);

    expect(getStreamCharacters(tree).map(getText).join('')).toBe('beforeafter');
    expect(getText(skippedContent)).not.toBe('');
  });

  it('should support an explicitly revealed block without a runtime', () => {
    const tree = root([element('p', [text('ready')])]);

    rehypeStreamAnimated({ fadeDuration: 180, revealed: true })(tree as any);

    expect(getStreamCharacters(tree)).toHaveLength(5);
    expect(getStreamCharacters(tree)[0]).toMatchObject({
      properties: { className: 'stream-char stream-char-revealed' }
    });
  });
});
