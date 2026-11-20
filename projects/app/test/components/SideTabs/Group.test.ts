import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import SideTabsGroup from '@/components/SideTabs/Group';

vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name })
}));

vi.mock('@chakra-ui/react', async () => {
  const React = await import('react');
  return {
    Box: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', null, children),
    Flex: ({ children }: { children?: React.ReactNode }) =>
      React.createElement('div', null, children),
    Divider: () => React.createElement('hr', { 'data-divider': 'true' })
  };
});

describe('SideTabsGroup', () => {
  it('renders a divider after items with dividerAfter unless it is the last item', () => {
    const html = renderToStaticMarkup(
      React.createElement(SideTabsGroup, {
        value: 'a',
        onChange: () => undefined,
        list: [
          { label: 'Item A', value: 'a', dividerAfter: true },
          {
            label: 'Group B',
            value: 'b',
            dividerAfter: true,
            children: [{ label: 'Child B1', value: 'b1' }]
          },
          { label: 'Item C', value: 'c', dividerAfter: true }
        ]
      })
    );

    expect(html.match(/data-divider="true"/g)).toHaveLength(2);
    expect(html).toContain('Item A');
    expect(html).toContain('Group B');
    expect(html).toContain('Item C');
    expect(html.indexOf('Item A')).toBeLessThan(html.indexOf('data-divider="true"'));
    expect(html.lastIndexOf('data-divider="true"')).toBeLessThan(html.indexOf('Item C'));
  });
});
