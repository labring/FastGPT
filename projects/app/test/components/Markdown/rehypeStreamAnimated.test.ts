import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import {
  getStreamingAppendLength,
  rehypeStreamAnimated
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
const streamTail = (children: TestNode[]) => element('stream-tail', children, {});
const root = (children: TestNode[]) => ({ type: 'root' as const, children });

const getElementsByTagName = (node: TestNode, tagName: string): TestNode[] => {
  if (node.type === 'text' || !('children' in node) || !Array.isArray(node.children)) return [];

  return [
    ...(node.type === 'element' && node.tagName === tagName ? [node] : []),
    ...node.children.flatMap((child) => getElementsByTagName(child, tagName))
  ];
};

describe('getStreamingAppendLength', () => {
  it('should return the appended visible Unicode code point count', () => {
    expect(getStreamingAppendLength({ previousSource: '', currentSource: 'hello' })).toBe(5);
    expect(
      getStreamingAppendLength({ previousSource: 'hello', currentSource: 'hello world' })
    ).toBe(5);
    expect(getStreamingAppendLength({ previousSource: 'hello', currentSource: 'hello😀' })).toBe(1);
  });

  it('should skip replacements and cap an oversized appended batch', () => {
    expect(getStreamingAppendLength({ previousSource: 'hello', currentSource: 'hullo' })).toBe(0);
    expect(
      getStreamingAppendLength({
        previousSource: '',
        currentSource: 'a'.repeat(100),
        maxLength: 64
      })
    ).toBe(64);
  });

  it('should ignore whitespace-only appends', () => {
    expect(getStreamingAppendLength({ previousSource: 'hello', currentSource: 'hello\n' })).toBe(0);
    expect(getStreamingAppendLength({ previousSource: 'hello', currentSource: 'hello   ' })).toBe(
      0
    );
    expect(getStreamingAppendLength({ previousSource: 'hello', currentSource: 'hello\n>' })).toBe(
      0
    );
    expect(getStreamingAppendLength({ previousSource: 'hello', currentSource: 'hello\n**' })).toBe(
      0
    );
    expect(
      getStreamingAppendLength({ previousSource: 'hello', currentSource: 'hello world  ' })
    ).toBe(5);
  });
});

describe('rehypeStreamAnimated', () => {
  it('should render the custom tail element through react-markdown components', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReactMarkdown,
        {
          rehypePlugins: [[rehypeStreamAnimated, { tailLength: 2 }]],
          components: {
            'stream-tail': ({ children }: { children?: React.ReactNode }) =>
              React.createElement('span', { 'data-stream-tail': true }, children)
          } as any
        },
        'hello'
      )
    );

    expect(html).toBe('<p>hel<span data-stream-tail="true">lo</span></p>');
  });

  it('should only wrap the latest tail in the last text block', () => {
    const tree = root([element('p', [text('first block')]), element('p', [text('hello world')])]);

    rehypeStreamAnimated({ tailLength: 5 })(tree as any);

    expect(tree).toEqual(
      root([
        element('p', [text('first block')]),
        element('p', [text('hello '), streamTail([text('world')])])
      ])
    );
  });

  it('should keep the animated element count bounded for long text', () => {
    const tree = root([element('p', [text('a'.repeat(20_000))])]);

    rehypeStreamAnimated({ tailLength: 64 })(tree as any);

    expect(getElementsByTagName(tree, 'stream-tail')).toHaveLength(1);
    expect(tree).toEqual(
      root([element('p', [text('a'.repeat(20_000 - 64)), streamTail([text('a'.repeat(64))])])])
    );
  });

  it('should preserve inline markup while wrapping a tail across text nodes', () => {
    const tree = root([
      element('p', [text('before '), element('strong', [text('bold')]), text(' end')])
    ]);

    rehypeStreamAnimated({ tailLength: 7 })(tree as any);

    expect(tree).toEqual(
      root([
        element('p', [
          text('before '),
          element('strong', [text('b'), streamTail([text('old')])]),
          streamTail([text(' end')])
        ])
      ])
    );
  });

  it('should find renderable text nested inside the last block', () => {
    const tree = root([element('p', [element('strong', [text('bold')])])]);

    rehypeStreamAnimated({ tailLength: 2 })(tree as any);

    expect(tree).toEqual(
      root([element('p', [element('strong', [text('bo'), streamTail([text('ld')])])])])
    );
  });

  it.each([
    element('code', [text('new')]),
    element('table', [element('tbody', [element('tr', [element('td', [text('new')])])])]),
    element('svg', [text('new')]),
    element('span', [text('new')], { className: ['katex'] }),
    element('span', [text('new')], { className: 'katex-html' })
  ])('should not cross a skipped tail to animate old text', (skippedTail) => {
    const tree = root([element('p', [text('old'), skippedTail])]);

    rehypeStreamAnimated({ tailLength: 3 })(tree as any);

    expect(getElementsByTagName(tree, 'stream-tail')).toHaveLength(0);
    expect(tree).toEqual(root([element('p', [text('old'), skippedTail])]));
  });

  it.each([
    element('pre', [element('code', [text('new')])]),
    element('table', [element('tbody', [element('tr', [element('td', [text('new')])])])]),
    element('p', [element('span', [text('new')], { className: 'katex-html' })])
  ])('should not fall back to an earlier block after a skipped root block', (skippedBlock) => {
    const tree = root([element('p', [text('old')]), skippedBlock]);

    rehypeStreamAnimated({ tailLength: 3 })(tree as any);

    expect(getElementsByTagName(tree, 'stream-tail')).toHaveLength(0);
    expect(tree).toEqual(root([element('p', [text('old')]), skippedBlock]));
  });

  it('should not fall back across a skipped block nested in a container', () => {
    const tree = root([
      element('blockquote', [
        element('p', [text('old')]),
        element('pre', [element('code', [text('new')])])
      ])
    ]);

    rehypeStreamAnimated({ tailLength: 3 })(tree as any);

    expect(getElementsByTagName(tree, 'stream-tail')).toHaveLength(0);
    expect(tree).toEqual(
      root([
        element('blockquote', [
          element('p', [text('old')]),
          element('pre', [element('code', [text('new')])])
        ])
      ])
    );
  });

  it('should not fall back from a list paragraph to a following code block', () => {
    const tree = root([
      element('ul', [
        element('li', [
          element('p', [text('old')]),
          element('pre', [element('code', [text('new')])])
        ])
      ])
    ]);

    rehypeStreamAnimated({ tailLength: 3 })(tree as any);

    expect(getElementsByTagName(tree, 'stream-tail')).toHaveLength(0);
    expect(tree).toEqual(
      root([
        element('ul', [
          element('li', [
            element('p', [text('old')]),
            element('pre', [element('code', [text('new')])])
          ])
        ])
      ])
    );
  });

  it('should animate ordinary text that follows inline code in the same block', () => {
    const tree = root([element('p', [element('code', [text('code')]), text(' new')])]);

    rehypeStreamAnimated({ tailLength: 4 })(tree as any);

    expect(tree).toEqual(
      root([element('p', [element('code', [text('code')]), streamTail([text(' new')])])])
    );
  });

  it('should leave the tree unchanged without an appended tail', () => {
    const tree = root([element('p', [text('hello')])]);

    rehypeStreamAnimated({ tailLength: 0 })(tree as any);

    expect(tree).toEqual(root([element('p', [text('hello')])]));
  });

  it('should not split an emoji surrogate pair', () => {
    const tree = root([element('p', [text('hello😀')])]);

    rehypeStreamAnimated({ tailLength: 1 })(tree as any);

    expect(tree).toEqual(root([element('p', [text('hello'), streamTail([text('😀')])])]));
  });

  it('should ignore trees without a renderable text block', () => {
    const emptyRoot = { type: 'root' as const };
    const emptyBlocks = root([
      { type: 'text', value: 'outside block' },
      element('p', [text(''), { type: 'comment' } as TestNode]),
      element('div', [])
    ]);

    rehypeStreamAnimated({ tailLength: 2 })(emptyRoot);
    rehypeStreamAnimated({ tailLength: 2 })(emptyBlocks as any);

    expect(emptyRoot).toEqual({ type: 'root' });
    expect(getElementsByTagName(emptyBlocks, 'stream-tail')).toHaveLength(0);
  });

  it('should skip non-element tail nodes and elements without children', () => {
    const childWithoutChildren = { type: 'element' as const, tagName: 'span' };
    const tree = root([
      element('p', [
        text('hello'),
        childWithoutChildren as TestNode,
        { type: 'comment' } as TestNode
      ])
    ]);

    rehypeStreamAnimated({ tailLength: 2 })(tree as any);

    expect(tree).toEqual(
      root([
        element('p', [
          text('hel'),
          streamTail([text('lo')]),
          childWithoutChildren as TestNode,
          { type: 'comment' } as TestNode
        ])
      ])
    );
  });
});
