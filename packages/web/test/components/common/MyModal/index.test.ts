// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import ModalV1 from '../../../../components/common/MyModal';
import ModalV2 from '../../../../components/v2/common/MyModal';

vi.mock('../../../../hooks/useSystem', () => ({ useSystem: () => ({ isPc: true }) }));
vi.mock('../../../../components/common/Avatar', () => ({ default: () => null }));
vi.mock('../../../../components/common/MyLoading', () => ({
  default: () => React.createElement('div', { 'data-loading-overlay': '' })
}));
vi.mock('@chakra-ui/react', () => {
  const Box = React.forwardRef<HTMLDivElement, React.PropsWithChildren<Record<string, unknown>>>(
    function MockBox({ children, ...props }, ref) {
      return React.createElement(
        'div',
        {
          ref,
          id: props.id,
          'data-overflow': props.overflow,
          'data-flex': props.flex,
          'data-max-height': props.maxH,
          'data-px': props.px,
          'data-gap': props.gap
        },
        children
      );
    }
  );
  return {
    Box,
    Flex: Box,
    ModalContent: Box,
    ModalHeader: Box,
    ModalOverlay: () => null,
    ModalCloseButton: () => React.createElement('button', null, 'close'),
    Modal: ({ children, isOpen }: React.PropsWithChildren<{ isOpen: boolean }>) =>
      isOpen ? children : null
  };
});

describe('MyModal loading viewport', () => {
  it.each([
    ['V1', ModalV1],
    ['V2', ModalV2]
  ] as const)('%s 的遮罩独立于正文滚动，加载切换保留输入和滚动位置', async (_name, Modal) => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const render = async (isLoading: boolean) =>
      act(async () => {
        root.render(
          React.createElement(
            Modal,
            { title: '标题', isLoading },
            React.createElement('input', { defaultValue: '' })
          )
        );
      });

    await render(false);
    const input = host.querySelector('input')!;
    const viewport = input.parentElement!;
    const shell = viewport.parentElement!;
    input.value = '未保存';
    viewport.scrollTop = 300;
    expect(viewport.getAttribute('data-overflow')).toBe('overlay');
    expect(shell.getAttribute('data-overflow')).toBe('hidden');
    expect(shell.textContent).not.toContain('标题');

    await render(true);
    expect(host.querySelector('[data-loading-overlay]')?.parentElement).toBe(shell);
    expect(viewport.contains(host.querySelector('[data-loading-overlay]'))).toBe(false);
    await render(false);
    expect(host.querySelector('input')).toBe(input);
    expect(input.value).toBe('未保存');
    expect(viewport.scrollTop).toBe(300);
    expect(host.querySelector('[data-loading-overlay]')).toBeNull();
    await act(async () => root.unmount());
  });

  it('V2 将正文布局约束留在外壳，内容样式留在滚动层，footer 在遮罩之外', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () =>
      root.render(
        React.createElement(
          ModalV2,
          {
            isLoading: true,
            bodyStyles: { flex: '1 0 0', maxH: '300px', px: 4, gap: 3, overflow: 'hidden' },
            footer: React.createElement('button', { id: 'footer' }, '保存')
          },
          React.createElement('input')
        )
      )
    );
    const viewport = host.querySelector('input')!.parentElement!;
    const shell = viewport.parentElement!;
    expect(shell.getAttribute('data-flex')).toBe('1 0 0');
    expect(shell.getAttribute('data-max-height')).toBe('300px');
    expect(viewport.getAttribute('data-px')).toBe('4');
    expect(viewport.getAttribute('data-gap')).toBe('3');
    expect(viewport.getAttribute('data-overflow')).toBe('hidden');
    expect(shell.contains(host.querySelector('#footer'))).toBe(false);
    await act(async () => root.unmount());
  });

  it.each([
    ['V1', ModalV1],
    ['V2', ModalV2]
  ] as const)('%s 显式允许溢出时，外壳不会裁剪正文中的选择器', async (_name, Modal) => {
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () =>
      root.render(
        React.createElement(
          Modal,
          {
            overflow: 'unset',
            isLoading: true
          },
          React.createElement('input')
        )
      )
    );
    const viewport = host.querySelector('input')!.parentElement!;
    expect(viewport.getAttribute('data-overflow')).toBe('unset');
    expect(viewport.parentElement?.getAttribute('data-overflow')).toBe('visible');
    await act(async () => root.unmount());
  });
});
