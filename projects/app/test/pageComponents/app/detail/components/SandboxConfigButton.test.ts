import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  feConfigs: {} as Record<string, any>
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: mocks.feConfigs })
}));

vi.mock('@fastgpt/web/components/common/Tag/index', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', { 'data-testid': 'tag' }, children)
}));

vi.mock('@chakra-ui/react', () => {
  const Element = ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', {}, children);
  return {
    Box: Element,
    Button: Element,
    Flex: Element,
    HStack: Element,
    Switch: Element,
    useDisclosure: () => ({ isOpen: false, onOpen: vi.fn(), onClose: vi.fn() })
  };
});

vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/MyTooltip/QuestionTip', () => ({
  default: () => null
}));
vi.mock('@fastgpt/web/components/v2/common/MyModal', () => ({
  default: () => null
}));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/app/detail/components/SandboxEntrypointEditor', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/app/detail/components/SandboxNotSupportTip', () => ({
  default: ({ type }: { type: string }) =>
    React.createElement('span', { 'data-testid': 'not-support-tip' }, type)
}));

import SandboxConfigButton from '@/pageComponents/app/detail/components/SandboxConfigButton';

describe('SandboxConfigButton', () => {
  beforeEach(() => {
    mocks.feConfigs = {};
  });

  it('未配置 show_agent_sandbox_free_tip 时，即使支持沙箱也不显示限时免费提示', () => {
    mocks.feConfigs = { show_agent_sandbox_free_tip: false };
    const html = renderToStaticMarkup(
      React.createElement(SandboxConfigButton, {
        showSandbox: true,
        enableSandbox: true,
        isEnabled: false,
        onChangeSandbox: vi.fn()
      })
    );

    expect(html).not.toContain('app:sandbox_free_tip');
  });

  it('配置了 show_agent_sandbox_free_tip 为 true 时，显示限时免费提示', () => {
    mocks.feConfigs = { show_agent_sandbox_free_tip: true };
    const html = renderToStaticMarkup(
      React.createElement(SandboxConfigButton, {
        showSandbox: true,
        enableSandbox: true,
        isEnabled: false,
        onChangeSandbox: vi.fn()
      })
    );

    expect(html).toContain('app:sandbox_free_tip');
  });

  it('沙箱不支持时，显示 SandboxNotSupportTip', () => {
    mocks.feConfigs = { show_agent_sandbox_free_tip: true };
    const html = renderToStaticMarkup(
      React.createElement(SandboxConfigButton, {
        showSandbox: false,
        enableSandbox: true,
        isEnabled: false,
        onChangeSandbox: vi.fn()
      })
    );

    expect(html).not.toContain('app:sandbox_free_tip');
    expect(html).toContain('systemDisable');
  });
});
