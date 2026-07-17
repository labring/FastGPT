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
  | { type: 'root'; children: TestNode[] }
  | {
      type: 'element';
      tagName: string;
      properties?: Record<string, unknown>;
      children: TestNode[];
    }
  | { type: 'text'; value: string };

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
const getStreamTails = (node: TestNode) =>
  getElementsByTagName(node, 'span').filter(
    (item) =>
      item.type === 'element' &&
      typeof item.properties?.className === 'string' &&
      item.properties.className.includes('stream-tail')
  );
const getText = (node: TestNode): string =>
  node.type === 'text' ? node.value : node.children.map(getText).join('');
const createRuntime = (): StreamAnimatedRuntime => ({ segments: [], visibleText: '' });

describe('rehypeStreamAnimated', () => {
  it('should wrap one visible segment instead of one node per character', () => {
    const runtime = createRuntime();
    const tree = root([element('p', [text('hello')])]);

    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(tree as any);

    expect(getStreamTails(tree)).toHaveLength(1);
    expect(getStreamTails(tree)[0]).toMatchObject({
      properties: { className: 'stream-tail', style: 'animation-delay:0ms' }
    });
    expect(getText(getStreamTails(tree)[0])).toBe('hello');
    expect(runtime.segments).toEqual([{ bornAt: 100, end: 5, start: 0 }]);
  });

  it('should preserve the birth time of old text and animate only the appended segment', () => {
    const runtime = createRuntime();
    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(
      root([element('p', [text('first')])]) as any
    );

    const tree = root([element('p', [text('first second')])]);
    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 120, runtime })(tree as any);

    expect(runtime.segments).toEqual([
      { bornAt: 100, end: 5, start: 0 },
      { bornAt: 120, end: 12, start: 5 }
    ]);
    expect(getStreamTails(tree).map(getText)).toEqual(['first', ' second']);
    expect(getStreamTails(tree).map((node: any) => node.properties.style)).toEqual([
      'animation-delay:-20ms',
      'animation-delay:0ms'
    ]);
  });

  it.each(['ul', 'ol'])(
    'should continue an existing %s item animation without replaying it when a new item appears',
    (tagName) => {
      const runtime = createRuntime();
      rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(
        root([element(tagName, [element('li', [text('first')])])]) as any
      );

      const tree = root([
        element(tagName, [element('li', [text('first')]), element('li', [text('second')])])
      ]);
      rehypeStreamAnimated({ fadeDuration: 180, nowMs: 120, runtime })(tree as any);

      expect(runtime.segments).toEqual([
        { bornAt: 100, end: 5, start: 0 },
        { bornAt: 120, end: 11, start: 5 }
      ]);
      expect(getStreamTails(tree).map(getText)).toEqual(['first', 'second']);
      expect((getStreamTails(tree)[0] as any).properties.style).toBe('animation-delay:-20ms');
    }
  );

  it('should preserve inline markup while mapping visible segment ranges', () => {
    const runtime = createRuntime();
    const tree = root([element('p', [text('a'), element('strong', [text('bc')]), text('d')])]);

    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(tree as any);

    expect(getElementsByTagName(tree, 'strong')).toHaveLength(1);
    expect(getStreamTails(tree).map(getText).join('')).toBe('abcd');
    expect(runtime.segments).toEqual([{ bornAt: 100, end: 4, start: 0 }]);
  });

  it('should not allocate a new segment when repaired markdown changes only the AST', () => {
    const runtime = createRuntime();
    const render = (source: string, nowMs: number) =>
      renderToStaticMarkup(
        React.createElement(
          ReactMarkdown,
          { rehypePlugins: [[rehypeStreamAnimated, { fadeDuration: 180, nowMs, runtime }]] },
          prepareStreamingMarkdown(source)
        )
      );

    render('**粗体', 100);
    render('**粗体**', 150);

    expect(runtime.visibleText).toBe('粗体');
    expect(runtime.segments).toEqual([{ bornAt: 100, end: 2, start: 0 }]);
  });

  it('should preserve the common prefix and animate only a corrected suffix', () => {
    const runtime = createRuntime();
    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(
      root([element('p', [text('abc')])]) as any
    );

    const tree = root([element('p', [text('ax')])]);
    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 150, runtime })(tree as any);

    expect(runtime.visibleText).toBe('ax');
    expect(runtime.segments).toEqual([
      { bornAt: 100, end: 1, start: 0 },
      { bornAt: 150, end: 2, start: 1 }
    ]);
  });

  it('should use Unicode code point offsets', () => {
    const runtime = createRuntime();
    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(
      root([element('p', [text('a😀b')])]) as any
    );

    expect(runtime.visibleText).toBe('a😀b');
    expect(runtime.segments).toEqual([{ bornAt: 100, end: 3, start: 0 }]);
  });

  it('should remove expired segments instead of keeping revealed wrappers', () => {
    const runtime: StreamAnimatedRuntime = {
      segments: [{ bornAt: 100, end: 4, start: 0 }],
      visibleText: 'done'
    };
    const tree = root([element('p', [text('done')])]);

    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 300, runtime })(tree as any);

    expect(runtime.segments).toEqual([]);
    expect(getStreamTails(tree)).toHaveLength(0);
    expect(getText(tree)).toBe('done');
  });

  it.each([
    element('code', [text('code')]),
    element('table', [element('tbody', [element('tr', [element('td', [text('cell')])])])]),
    element('svg', [text('svg')]),
    element('span', [text('formula')], { className: ['katex'] })
  ])('should not include skipped content in animation segments', (skippedContent) => {
    const runtime = createRuntime();
    const tree = root([element('p', [text('before'), skippedContent, text('after')])]);

    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(tree as any);

    expect(runtime.visibleText).toBe('beforeafter');
    expect(getStreamTails(tree).map(getText).join('')).toBe('beforeafter');
    expect(getText(skippedContent)).not.toBe('');
  });

  it('should cap retained animation segments', () => {
    const runtime = createRuntime();

    for (let index = 1; index <= 16; index++) {
      rehypeStreamAnimated({ fadeDuration: 1000, nowMs: index * 10, runtime })(
        root([element('p', [text('x'.repeat(index))])]) as any
      );
    }

    expect(runtime.segments).toHaveLength(14);
    expect(runtime.segments[0].start).toBe(2);
  });

  it('should animate only a bounded tail for a large initial paragraph', () => {
    const runtime = createRuntime();
    const tree = root([element('p', [text('x'.repeat(2000))])]);

    rehypeStreamAnimated({ fadeDuration: 180, nowMs: 100, runtime })(tree as any);

    expect(getStreamTails(tree)).toHaveLength(1);
    expect(getText(getStreamTails(tree)[0])).toHaveLength(64);
    expect(runtime.segments).toEqual([{ bornAt: 100, end: 2000, start: 1936 }]);
  });
});
