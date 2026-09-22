// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfirm } from '../../hooks/useConfirm';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('../../components/v2/common/MyModal', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? React.createElement('div', { 'data-testid': 'mock-modal' }, children) : null
}));

vi.mock('../../components/common/Icon', () => ({
  default: () => React.createElement('span', { 'data-testid': 'mock-icon' })
}));

vi.mock('../../components/common/Avatar', () => ({
  default: () => React.createElement('span', { 'data-testid': 'mock-avatar' })
}));

vi.mock('@chakra-ui/react', async () => {
  const actual = await vi.importActual<typeof import('@chakra-ui/react')>('@chakra-ui/react');
  return {
    ...actual,
    Button: ({ children, isLoading, isDisabled, onClick, ...props }: any) =>
      React.createElement(
        'button',
        {
          ...props,
          'data-loading': isLoading ? 'true' : 'false',
          disabled: Boolean(isDisabled || isLoading),
          onClick
        },
        isLoading ? 'loading...' : children
      ),
    Box: ({ children }: any) => React.createElement('div', null, children),
    Flex: ({ children }: any) => React.createElement('div', null, children),
    HStack: ({ children }: any) => React.createElement('div', null, children),
    VStack: ({ children }: any) => React.createElement('div', null, children)
  };
});

type HarnessHandle = {
  openConfirm: ReturnType<typeof useConfirm>['openConfirm'];
};

const TestHarness = ({ onReady }: { onReady: (handle: HarnessHandle) => void }) => {
  const { openConfirm, ConfirmModal } = useConfirm({
    content: 'test content'
  });

  React.useEffect(() => {
    onReady({ openConfirm });
  }, [onReady, openConfirm]);

  return React.createElement(
    'div',
    null,
    React.createElement(ConfirmModal, { confirmText: '确认' })
  );
};

describe('useConfirm', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('should reset loading state when reopening confirm modal after a successful confirmation', async () => {
    let handle: HarnessHandle | undefined;
    await act(async () => {
      root.render(React.createElement(TestHarness, { onReady: (h) => (handle = h) }));
    });

    expect(container.querySelector('[data-testid="mock-modal"]')).toBeNull();

    // 第一次打开弹窗
    let resolveConfirm: () => void = () => {};
    const onConfirmFirst = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );

    await act(async () => {
      handle?.openConfirm({ onConfirm: onConfirmFirst })();
    });

    expect(container.querySelector('[data-testid="mock-modal"]')).not.toBeNull();
    const buttons = container.querySelectorAll('button');
    const confirmBtn = buttons[buttons.length - 1];
    expect(confirmBtn.getAttribute('data-loading')).toBe('false');

    // 点击确认，进入 loading 态
    await act(async () => {
      confirmBtn.click();
    });
    expect(confirmBtn.getAttribute('data-loading')).toBe('true');

    // 完成确认，弹窗关闭
    await act(async () => {
      resolveConfirm();
    });
    expect(container.querySelector('[data-testid="mock-modal"]')).toBeNull();

    // 第二次打开弹窗：验证不再残留 loading 态
    let resolveConfirmSecond: () => void = () => {};
    const onConfirmSecond = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirmSecond = resolve;
        })
    );

    await act(async () => {
      handle?.openConfirm({ onConfirm: onConfirmSecond })();
    });

    expect(container.querySelector('[data-testid="mock-modal"]')).not.toBeNull();
    const buttonsSecond = container.querySelectorAll('button');
    const confirmBtnSecond = buttonsSecond[buttonsSecond.length - 1];
    expect(confirmBtnSecond.getAttribute('data-loading')).toBe('false');
    expect(confirmBtnSecond.disabled).toBe(false);

    // 第二次点击确认，能正常触发
    await act(async () => {
      confirmBtnSecond.click();
    });
    expect(confirmBtnSecond.getAttribute('data-loading')).toBe('true');
    expect(onConfirmSecond).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConfirmSecond();
    });
    expect(container.querySelector('[data-testid="mock-modal"]')).toBeNull();
  });

  it('should clear loading state when confirmation fails so user can retry', async () => {
    let handle: HarnessHandle | undefined;
    await act(async () => {
      root.render(React.createElement(TestHarness, { onReady: (h) => (handle = h) }));
    });

    let rejectConfirm: (err: any) => void = () => {};
    const onConfirmFail = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectConfirm = reject;
        })
    );

    await act(async () => {
      handle?.openConfirm({ onConfirm: onConfirmFail })();
    });

    const buttons = container.querySelectorAll('button');
    const confirmBtn = buttons[buttons.length - 1];

    await act(async () => {
      confirmBtn.click();
    });
    expect(confirmBtn.getAttribute('data-loading')).toBe('true');

    // 失败时保持弹窗打开并解除 loading
    await act(async () => {
      rejectConfirm(new Error('failed'));
    });
    expect(container.querySelector('[data-testid="mock-modal"]')).not.toBeNull();
    expect(confirmBtn.getAttribute('data-loading')).toBe('false');
    expect(confirmBtn.disabled).toBe(false);
  });
});
