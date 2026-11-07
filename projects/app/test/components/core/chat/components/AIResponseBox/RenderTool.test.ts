import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChakraProvider } from '@chakra-ui/react';
import { describe, expect, it, vi } from 'vitest';
import RenderTool from '@/components/core/chat/components/AIResponseBox/RenderTool';

vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@/components/Markdown', () => ({
  default: ({ source }: { source: string }) => React.createElement('pre', null, source)
}));
vi.mock('@fastgpt/web/components/common/Avatar', () => ({
  default: () => React.createElement('span', { 'data-avatar': '' })
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name })
}));

describe('RenderTool', () => {
  it.each([
    { response: undefined, running: true },
    { response: 'secret-response', running: false }
  ])('renders only internal tool information with running=$running', ({ response, running }) => {
    const html = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(RenderTool, {
          showAnimation: true,
          defaultExpanded: true,
          tool: {
            id: 'skill-reference',
            toolName: 'Read file',
            toolAvatar: '',
            functionName: 'sandbox_read_file',
            params: 'secret-input',
            response,
            hideDetails: true
          }
        })
      )
    );

    expect(html).toContain('Read file');
    expect(html).toContain('data-avatar');
    expect(html).not.toContain('secret-input');
    expect(html).not.toContain('secret-response');
    expect(html).not.toContain('<button');
    expect(html.includes('data-icon="common/loading"')).toBe(running);
  });

  it('retains expandable inputs and responses for public tools', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ChakraProvider,
        null,
        React.createElement(RenderTool, {
          showAnimation: false,
          defaultExpanded: true,
          tool: {
            id: 'public-file',
            toolName: 'Read file',
            toolAvatar: '',
            functionName: 'sandbox_read_file',
            params: 'public-input',
            response: 'public-response'
          }
        })
      )
    );

    expect(html).toContain('<button');
    expect(html).toContain('public-input');
    expect(html).toContain('public-response');
  });
});
