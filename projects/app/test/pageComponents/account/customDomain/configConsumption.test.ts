// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { buildCustomDomainFeConfig } from '@fastgpt/global/common/system/config/frontendProjection';

const state = vi.hoisted(() => ({ feConfigs: {} as any }));
vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('@/web/common/system/useSystemStore', () => ({ useSystemStore: () => state }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/web/hooks/useCopyData', () => ({ useCopyData: () => ({ copyData: vi.fn() }) }));
vi.mock('@fastgpt/web/hooks/useRequest', () => ({
  useRequest: () => ({ runAsync: vi.fn(), loading: false })
}));
vi.mock('@fastgpt/web/hooks/useConfirm', () => ({
  useConfirm: () => ({ openConfirm: vi.fn(), ConfirmModal: () => null })
}));
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/account/info', replace: vi.fn() })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { team: { permission: {} } }, setUserInfo: vi.fn() })
}));
vi.mock('@/web/support/customDomain/api', () => ({
  activeCustomDomain: vi.fn(),
  checkCustomDomainDNSResolve: vi.fn(),
  createCustomDomain: vi.fn()
}));
vi.mock('@/web/common/system/doc', () => ({ getDocPath: (path: string) => path }));
vi.mock('@fastgpt/global/common/i18n/utils', () => ({ i18nT: (key: string) => key }));
vi.mock('next-i18next', () => ({
  Trans: ({ values }: { values: object }) => JSON.stringify(values)
}));
vi.mock('@fastgpt/web/components/common/Icon', () => ({
  default: ({ name }: { name: string }) => React.createElement('span', { 'data-icon': name })
}));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@fastgpt/web/components/common/FixedTable', () => ({
  FixedTableContainer: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock('@/pageComponents/common/SecondaryNavigationContainer', () => ({
  default: ({ tabs }: { tabs: { value: string }[] }) => tabs.map((tab) => tab.value).join(',')
}));
vi.mock('@chakra-ui/react', async () => {
  const React = await import('react');
  const names = [
    'ModalBody',
    'Box',
    'Radio',
    'Flex',
    'Text',
    'Input',
    'InputGroup',
    'InputRightElement',
    'Tag',
    'Table',
    'Tbody',
    'Td',
    'Th',
    'Thead',
    'Tr',
    'IconButton',
    'Button',
    'ModalFooter',
    'Link'
  ];
  return Object.fromEntries(
    names.map((name) => [
      name,
      ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) =>
        React.createElement('div', { onClick }, children)
    ])
  );
});

import CreateCustomDomainModal from '@/pageComponents/account/customDomain/createModal';
import AccountContainer from '@/pageComponents/account/AccountContainer';

/** 渲染真实组件并点击 provider；不执行 DNS、Pro API 或集群部署。 */
describe('custom domain frontend configuration consumption', () => {
  let root: Root;
  let container: HTMLDivElement;
  const mount = async (element: React.ReactNode) => {
    container = document.createElement('div');
    root = createRoot(container);
    await act(async () => root.render(element));
  };
  afterEach(async () => {
    if (root) await act(async () => root.unmount());
  });

  it('uses each provider CNAME from the current projected snapshot', async () => {
    const publish = (phase: string) => {
      const config = resolveSystemInstanceConfig({
        site: {
          customDomain: {
            enable: true,
            domain: {
              aliyun: `aliyun-${phase}.example.test`,
              tencent: `tencent-${phase}.example.test`,
              volcengine: `volcengine-${phase}.example.test`
            },
            kc: { aliyun: 'private-kubeconfig-must-not-render' }
          }
        }
      });
      state.feConfigs = {
        isPlus: true,
        customDomain: buildCustomDomainFeConfig(config.site.customDomain)
      };
    };
    publish('a');
    await mount(
      React.createElement(CreateCustomDomainModal, { type: 'create', onClose: () => undefined })
    );
    for (const phase of ['a', 'b']) {
      publish(phase);
      await act(async () =>
        root.render(
          React.createElement(CreateCustomDomainModal, { type: 'create', onClose: () => undefined })
        )
      );
      for (const provider of ['aliyun', 'tencent', 'volcengine']) {
        const icon = container.querySelector(
          `[data-icon="support/account/customDomain/provider/${provider}"]`
        );
        expect(icon).not.toBeNull();
        await act(async () => icon!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
        expect(container.textContent).toMatch(
          new RegExp(`fastgpt-[a-z]{8}\\.${provider}-${phase}\\.example\\.test`)
        );
      }
      expect(container.textContent).not.toContain('private-kubeconfig-must-not-render');
    }
  });

  it('updates the account entry when customDomain.enable changes', async () => {
    const project = (enable: boolean) => ({
      isPlus: true,
      customDomain: buildCustomDomainFeConfig(
        resolveSystemInstanceConfig({ site: { customDomain: { enable } } }).site.customDomain
      )
    });
    state.feConfigs = project(false);
    await mount(React.createElement(AccountContainer, null, 'owned'));
    expect(container.textContent).not.toContain('customDomain');
    for (const enable of [true, false]) {
      state.feConfigs = project(enable);
      await act(async () => root.render(React.createElement(AccountContainer, null, 'owned')));
      expect(container.textContent?.includes('customDomain')).toBe(enable);
    }
  });
});
