import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';

import {
  rehypeStreamAnimated,
  type StreamAnimatedRuntime
} from '@/components/Markdown/rehypeStreamAnimated';
import { prepareStreamingMarkdown } from '@/components/Markdown/utils';

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

const createRuntime = (births: number[] = []): StreamAnimatedRuntime => ({
  births,
  ...(births.length === 0
    ? {
        revealClock: { lastTime: 0 },
        visibleText: ''
      }
    : {}),
  styles: []
});

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

  it('should skip list subtrees to prevent completed items from replaying their animation', () => {
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

    expect(getStreamCharacters(tree)).toHaveLength(0);
    expect(getText(tree)).toBe('firstsecond');
  });

  it.each(['ul', 'ol'])(
    'should keep %s items visible when the next item starts rendering',
    (tag) => {
      const runtime = createRuntime();
      rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(
        root([element(tag, [element('li', [text('first')])])]) as any
      );

      const nextTree = root([
        element(tag, [element('li', [text('first')]), element('li', [text('second')])])
      ]);
      rehypeStreamAnimated({ fadeDuration: 180, nowMs: 120, runtime })(nextTree as any);

      expect(getStreamCharacters(nextTree)).toHaveLength(0);
      expect(getText(nextTree)).toBe('firstsecond');
    }
  );

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

  it('should allocate the timeline from visible text instead of repaired markdown syntax', () => {
    const runtime = createRuntime();
    const render = (source: string, nowMs: number) =>
      renderToStaticMarkup(
        React.createElement(
          ReactMarkdown,
          {
            rehypePlugins: [[rehypeStreamAnimated, { fadeDuration: 180, nowMs, runtime }]]
          },
          prepareStreamingMarkdown(source)
        )
      );

    render('**粗', 100);
    expect(runtime.visibleText).toBe('粗');
    expect(runtime.births).toHaveLength(1);

    const firstBirth = runtime.births[0];
    render('**粗体', 150);
    expect(runtime.visibleText).toBe('粗体');
    expect(runtime.births).toHaveLength(2);
    expect(runtime.births[0]).toBe(firstBirth);
    expect(runtime.births[1]).toBeGreaterThanOrEqual(150);

    render('**粗体**', 200);
    expect(runtime.visibleText).toBe('粗体');
    expect(runtime.births).toHaveLength(2);
  });

  it('should count visible Unicode code points instead of UTF-16 units', () => {
    const runtime = createRuntime();
    const tree = root([element('p', [text('a😀b')])]);

    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(tree as any);

    expect(runtime.visibleText).toBe('a😀b');
    expect(runtime.births).toHaveLength(3);
  });

  it('should preserve only the visible common prefix after a tail correction', () => {
    const runtime = createRuntime();
    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(
      root([element('p', [text('abc')])]) as any
    );
    const firstBirth = runtime.births[0];
    runtime.styles[0] = 'animation-delay:-10ms';

    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 150, runtime })(
      root([element('p', [text('ax')])]) as any
    );

    expect(runtime.visibleText).toBe('ax');
    expect(runtime.births).toHaveLength(2);
    expect(runtime.births[0]).toBe(firstBirth);
    expect(runtime.births[1]).toBeGreaterThanOrEqual(150);
    expect(runtime.styles).toEqual(['animation-delay:-10ms', 'animation-delay:0ms']);
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
