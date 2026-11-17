// @vitest-environment jsdom

import React, { act } from 'react';
import { Box, ChakraProvider } from '@chakra-ui/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MySelect from '../../../../components/common/MySelect';

describe('MySelect scroll pagination and remote search behavior', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('delegates overflow scrolling to ScrollData and skips client filtering when onSearchChange is provided', async () => {
    const onSearchChange = vi.fn();
    let capturedScrollProps: Record<string, unknown> | undefined;

    const ScrollData = ({ children, ...props }: { children: React.ReactNode }) => {
      capturedScrollProps = props;
      return React.createElement(Box, { 'data-testid': 'scroll-data', ...props }, children);
    };

    await act(async () => {
      root.render(
        React.createElement(
          ChakraProvider,
          null,
          React.createElement(MySelect, {
            isSearch: true,
            onSearchChange,
            ScrollData: ScrollData as any,
            value: 't-1',
            list: [
              { label: 'Alpha Team', value: 't-1' },
              { label: 'Beta Team', value: 't-2' }
            ]
          })
        )
      );
    });

    const trigger = container.querySelector('button')!;
    await act(async () => {
      trigger.click();
    });

    expect(capturedScrollProps).toMatchObject({
      flex: '1 1 auto',
      minH: 0,
      h: 'auto',
      overflowY: 'auto'
    });

    const input = document.body.querySelector('input')!;
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      valueSetter?.call(input, 'UnmatchedKeyword');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(onSearchChange).toHaveBeenCalledWith('UnmatchedKeyword');
    // 远程搜索开启时不做本地二次过滤，保留服务端当前返回项直到新分页结果到达
    expect(document.body.textContent).toContain('Alpha Team');
    expect(document.body.textContent).toContain('Beta Team');
  });
});
