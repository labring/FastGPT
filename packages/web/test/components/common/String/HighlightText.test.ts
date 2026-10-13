import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@chakra-ui/react', () => ({
  Box: ({ children, color }: React.PropsWithChildren<{ color?: string }>) =>
    React.createElement('span', { 'data-color': color }, children)
}));

import HighlightText from '../../../../components/common/String/HighlightText';

const render = (rawText: string, matchText: string) =>
  renderToStaticMarkup(React.createElement(HighlightText, { rawText, matchText }));

const getHighlighted = (html: string) =>
  Array.from(html.matchAll(/<span data-color="primary\.600">([^<]*)<\/span>/g)).map(
    (match) => match[1]
  );

describe('HighlightText', () => {
  it('highlights the first case-insensitive match', () => {
    expect(getHighlighted(render('Get Weather', 'weather'))).toEqual(['Weather']);
  });

  it('matches regex special characters in the search text literally', () => {
    expect(getHighlighted(render('获取天气(API)', '('))).toEqual(['(']);
    expect(getHighlighted(render('获取天气(API)', '(API)'))).toEqual(['(API)']);
    expect(getHighlighted(render('C++ 代码助手', 'c++'))).toEqual(['C++']);
    expect(getHighlighted(render('[beta] 检索', '[beta'))).toEqual(['[beta']);
    expect(getHighlighted(render('v1.2', '.'))).toEqual(['.']);
  });
});
