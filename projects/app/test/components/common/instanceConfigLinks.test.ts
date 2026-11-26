import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { buildSystemFrontendConfig } from '@fastgpt/service/common/system/systemInstanceConfig/frontend';

const state = vi.hoisted(() => ({ feConfigs: {} as any, pathname: '/dashboard/agent' }));
vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  }
);
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: Object.assign(() => state, { getState: () => state })
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { team: { isWecomTeam: false } }, teamPlanStatus: {} })
}));
vi.mock('next/router', () => ({ useRouter: () => ({ pathname: state.pathname }) }));
vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  Trans: ({ components }: { components: Record<string, React.ReactElement> }) =>
    React.createElement(
      React.Fragment,
      null,
      ...Object.entries(components).map(([key, child]) => React.cloneElement(child, { key }, key))
    )
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@fastgpt/global/common/i18n/utils', () => ({ i18nT: (key: string) => key }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children }: { children: React.ReactNode }) => children
}));
// 只隔离 Markdown 渲染器；断言真实 CommunityModal 传入/清空 source，不代称 Markdown 语法验收。
vi.mock('@/components/Markdown', () => ({
  default: ({ source }: { source: string }) => React.createElement('pre', null, source)
}));
vi.mock('@/web/common/workorder/api', () => ({ getWorkorderURL: vi.fn() }));
vi.mock('@fastgpt/web/components/common/TagFilter', () => ({
  MultiSelectFilter: ({ footer }: { footer: React.ReactNode }) => footer,
  syncSelectedFilterValues: () => undefined,
  useCommonFilterLabels: () => ({})
}));
vi.mock('@chakra-ui/react', async () => {
  const React = await import('react');
  const component = React.forwardRef<HTMLElement, any>(
    ({ children, as = 'div', onClick, href, src, bgImage }, ref) =>
      React.createElement(as, { ref, onClick, href, src, 'data-background': bgImage }, children)
  );
  const link = React.forwardRef<HTMLElement, any>((props, ref) =>
    React.createElement(component, { ...props, ref, as: 'a' })
  );
  component.displayName = 'ConfigConsumerLayout';
  link.displayName = 'ConfigConsumerLink';
  return {
    Box: component,
    Flex: component,
    Link: link,
    Button: component,
    ModalBody: component,
    ModalFooter: component,
    Spinner: component,
    Center: component
  };
});

import PolicyTip from '@/pageComponents/login/LoginForm/PolicyTip';
import CommunityModal from '@/components/CommunityModal';
import TemplateCategoryFilter from '@/pageComponents/dashboard/agent/filters/TemplateCategoryFilter';
import LoginGuideLink from '@/pageComponents/login/LoginForm/LoginGuideLink';
import SupportBot from '@/components/Layout/SupportBot';
import ComplianceTip from '@/components/common/ComplianceTip';

/** 真实公开投影到生产组件；无请求、导航、iframe加载或后台配置写入。 */
describe('instance configuration links and visible text', () => {
  let container: HTMLDivElement;
  let root: Root;
  let dom: JSDOM;
  const publish = (phase: string) => {
    state.feConfigs = buildSystemFrontendConfig(
      resolveSystemInstanceConfig({
        site: {
          docUrl: phase ? `https://docs-${phase}.example.test` : '',
          concatMd: phase ? `owned contact ${phase}` : '',
          appTemplateCourse: phase ? `https://course-${phase}.example.test` : '',
          loginGuideDocUrl: phase ? `https://login-${phase}.example.test` : '',
          botIframeUrl: phase ? `https://bot-${phase}.example.test/embed?owned=1` : ''
        },
        feature: { showComplianceCopywriting: phase === 'a' }
      }),
      { commercialService: true }
    );
  };
  const render = async (element: React.ReactNode) => {
    await act(async () => root.render(element));
  };
  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    state.pathname = '/dashboard/agent';
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses current docUrl for policy links and hides them when empty', async () => {
    for (const phase of ['a', 'b', '']) {
      publish(phase);
      await render(React.createElement(PolicyTip));
      expect([...container.querySelectorAll('a')].map((link) => link.getAttribute('href'))).toEqual(
        phase
          ? [
              `https://docs-${phase}.example.test/guide/version/cloud/terms`,
              `https://docs-${phase}.example.test/guide/version/cloud/privacy`,
              null,
              null
            ]
          : []
      );
    }
  });
  it('passes the current contact Markdown source and clears old text', async () => {
    for (const phase of ['a', 'b', '']) {
      publish(phase);
      await render(React.createElement(CommunityModal, { onClose: () => undefined }));
      expect(container.querySelector('pre')?.textContent).toBe(
        phase ? `owned contact ${phase}` : ''
      );
    }
  });
  it('opens the configured template course and removes the empty entry', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    for (const phase of ['a', 'b', '']) {
      publish(phase);
      await render(
        React.createElement(TemplateCategoryFilter, {
          tags: [],
          value: { mode: 'all', tagIds: [] },
          onChange: () => undefined
        })
      );
      if (!phase) expect(container.textContent).toBe('');
      else {
        await act(async () =>
          container.firstElementChild!.dispatchEvent(
            new dom.window.MouseEvent('click', { bubbles: true })
          )
        );
        expect(open).toHaveBeenLastCalledWith(`https://course-${phase}.example.test`);
      }
    }
  });
  it('uses the current login help URL and hides the empty link', async () => {
    for (const phase of ['a', 'b', '']) {
      publish(phase);
      await render(React.createElement(LoginGuideLink));
      expect(container.querySelector('a')?.getAttribute('href') ?? null).toBe(
        phase ? `https://login-${phase}.example.test` : null
      );
    }
  });
  it('opens the current support iframe only on supported routes and clears it', async () => {
    for (const phase of ['a', 'b', '']) {
      publish(phase);
      await render(React.createElement(SupportBot));
      if (phase && !container.querySelector('iframe')) {
        const button = container.querySelector('[data-background*="/imgs/bot.svg"]');
        expect(button).not.toBeNull();
        await act(async () =>
          button!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
        );
      }
      expect(container.querySelector('iframe')?.getAttribute('src') ?? null).toBe(
        phase ? `https://bot-${phase}.example.test/embed?owned=1&showWorkorder=1` : null
      );
    }
    publish('a');
    state.pathname = '/login';
    await render(React.createElement(SupportBot));
    expect(container.textContent).toBe('');
  });
  it('shows and hides both compliance texts from the projected flag', async () => {
    for (const phase of ['a', 'b', '']) {
      publish(phase);
      await render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(ComplianceTip, { type: 'chat' }),
          React.createElement(ComplianceTip, { type: 'dataset' })
        )
      );
      expect(container.textContent).toBe(
        phase === 'a' ? 'common:compliance.chatcommon:compliance.dataset' : ''
      );
    }
  });
});
