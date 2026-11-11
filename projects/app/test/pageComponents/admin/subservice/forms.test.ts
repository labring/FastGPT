import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  effectiveConfig: {} as Record<string, unknown>,
  save: undefined as undefined | (() => Promise<unknown>),
  toc: [] as { id: string }[]
}));
vi.mock('@/web/common/system/useDomainConfig', () => ({
  useDomainConfig: () => ({
    effectiveConfig: mocks.effectiveConfig,
    isLoading: false,
    isUpdating: false,
    patchConfig: mocks.patch
  })
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: any) => React.createElement('div', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  Wrap: ({ children }: any) => React.createElement('div', null, children),
  Tag: ({ children }: any) => React.createElement('span', null, children),
  Input: React.forwardRef(function Input(
    { value, onChange, name, type, placeholder }: any,
    ref: any
  ) {
    return React.createElement('input', { ref, value, onChange, name, type, placeholder });
  })
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingPage', () => ({
  default: ({ children, onSave, tocItems }: any) => {
    mocks.save = onSave;
    mocks.toc = tocItems;
    return React.createElement('div', null, children);
  }
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingSection', () => ({
  default: ({ children, id }: any) => React.createElement('section', { id }, children)
}));
vi.mock('@/pageComponents/admin/settings/AdminFormItem', () => ({
  default: ({ children, label }: any) => React.createElement('label', null, label, children)
}));
vi.mock('@/pageComponents/admin/settings/AdminSwitchRow', () => ({
  default: ({ label, isChecked, onChange }: any) =>
    React.createElement(
      'button',
      {
        'data-label': label,
        'aria-checked': isChecked ?? false,
        onClick: () => onChange(!isChecked)
      },
      label
    )
}));
vi.mock('@/pageComponents/admin/settings/ConnectivityTestInput', () => ({
  default: React.forwardRef(function ConnectivityTestInput(
    { value, name, onChange, service, token }: any,
    ref: any
  ) {
    return React.createElement('input', {
      ref,
      value,
      name,
      onChange,
      'data-service': service,
      'data-token': token
    });
  })
}));

import CodeSandbox from '@/pageComponents/admin/subservice/code-sandbox';
import Mcp from '@/pageComponents/admin/subservice/mcp';

let dom: JSDOM;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  // React 在 Node 环境导入时会选择旧版 input 事件 polyfill；JSDOM 不实现 IE 方法。
  Object.defineProperty(dom.window.HTMLElement.prototype, 'attachEvent', { value: () => {} });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'detachEvent', { value: () => {} });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mocks.patch.mockReset().mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

const clickSwitch = async (label: string) => {
  const button = container.querySelector<HTMLButtonElement>(`[data-label="admin:${label}"]`)!;
  await act(async () => button.click());
};

describe('subservice settings forms', () => {
  it('hides sandbox connection and modules while disabled and retains saved masked credentials', async () => {
    mocks.effectiveConfig = resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: { codeSandbox: { enabled: false, url: 'http://sandbox', token: '******' } }
    });
    await act(async () => root.render(React.createElement(CodeSandbox)));
    expect(container.querySelector('[data-service="codeSandbox"]')).toBeNull();
    expect(container.querySelector('#modules')).toBeNull();
    expect(mocks.toc.map(({ id }) => id)).toEqual(['connection']);

    await clickSwitch('enable_code_sandbox');
    expect(container.querySelector<HTMLInputElement>('[data-service="codeSandbox"]')?.value).toBe(
      'http://sandbox'
    );
    expect(container.querySelector('[data-token="******"]')).not.toBeNull();
    expect(container.querySelector<HTMLInputElement>('[name="codeSandbox.token"]')?.type).toBe(
      'password'
    );
    expect(container.querySelector('#modules')).not.toBeNull();
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith({
      codeSandbox: { enabled: true, url: 'http://sandbox', token: '******' }
    });

    await clickSwitch('enable_code_sandbox');
    expect(container.querySelector('#modules')).toBeNull();
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith({
      codeSandbox: { enabled: false, url: 'http://sandbox', token: '******' }
    });
  });

  it('keeps the MCP switch available and requires a URL only when enabled', async () => {
    mocks.effectiveConfig = resolveDomainEffectiveConfig({ domain: 'subservice', overrides: {} });
    await act(async () => root.render(React.createElement(Mcp)));
    expect(container.querySelector('[data-label="admin:enable_mcp_sse"]')).not.toBeNull();
    expect(container.querySelector('[data-service="mcpSse"]')).toBeNull();
    await clickSwitch('enable_mcp_sse');
    expect(container.querySelector('[data-service="mcpSse"]')).not.toBeNull();
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(container.textContent).toContain('admin:required');
    await clickSwitch('enable_mcp_sse');
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith({ mcp: { enabled: false, sseProxyUrl: '' } });
  });

  it('requires both sandbox address and token when enabled, but allows disabling it', async () => {
    mocks.effectiveConfig = resolveDomainEffectiveConfig({ domain: 'subservice', overrides: {} });
    await act(async () => root.render(React.createElement(CodeSandbox)));
    await clickSwitch('enable_code_sandbox');
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(container.textContent?.match(/admin:required/g)).toHaveLength(2);

    await clickSwitch('enable_code_sandbox');
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith({
      codeSandbox: { enabled: false, url: '', token: '' }
    });
  });
});
