import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { describe, expect, it } from 'vitest';
import { MultipleRowSelect } from '../../../../components/common/MySelect/MultipleRowSelect';

describe('MultipleRowSelect loading', () => {
  it('uses the shared local loading overlay without collapsing its indicator', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(MultipleRowSelect, {
          list: [],
          value: [],
          isLoading: true,
          emptyTip: '模型请求中',
          onSelect: () => {}
        })
      )
    );
    const spinner = html.match(/<div\b[^>]*class="chakra-spinner[^>]*>/)?.[0];
    expect(spinner).toContain('data-preserve-width="true"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('模型请求中');
  });
});
