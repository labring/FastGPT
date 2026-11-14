import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import { SubserviceConfigSchema } from '@fastgpt/global/common/system/config/schemas/subservice';

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  effectiveConfig: {} as Record<string, unknown>,
  save: undefined as undefined | (() => Promise<unknown>),
  toc: [] as { id: string }[],
  inputs: new Map<string, (value: unknown) => void>(),
  changeProvider: undefined as undefined | ((value: string) => void)
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
  SimpleGrid: ({ children }: any) => React.createElement('div', null, children),
  NumberInput: () => null,
  NumberInputField: () => null,
  NumberInputStepper: () => null,
  NumberIncrementStepper: () => null,
  NumberDecrementStepper: () => null,
  Input: React.forwardRef(function Input(
    { value, onChange, name, type, placeholder }: any,
    ref: any
  ) {
    return React.createElement('input', { ref, value, onChange, name, type, placeholder });
  })
}));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({
  default: ({
    list,
    onChange
  }: {
    list: { value: string }[];
    onChange: (value: string) => void;
  }) => {
    if (list.some(({ value }) => value === 'none')) mocks.changeProvider = onChange;
    return null;
  }
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
    mocks.inputs.set(name, onChange);
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
import AgentSandbox from '@/pageComponents/admin/subservice/agent-sandbox';

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
  mocks.inputs.clear();
  mocks.changeProvider = undefined;
});

describe('agent sandbox hidden URL drafts', () => {
  const fields = [
    { name: 'agentSandbox.sealosdevbox.baseUrl', provider: 'sealosdevbox', other: 'opensandbox' },
    { name: 'agentSandbox.opensandbox.baseUrl', provider: 'opensandbox', other: 'sealosdevbox' },
    {
      name: 'agentSandbox.opensandbox.volumeManagerUrl',
      provider: 'opensandbox',
      other: 'sealosdevbox'
    }
  ] as const;

  /** 通过真实 RHF 输入回调留下草稿，再切换 Provider，检查提交值和服务端域契约。 */
  const saveDraft = async ({
    field,
    draft,
    target
  }: {
    field: (typeof fields)[number];
    draft: string;
    target: string;
  }) => {
    const baseline = resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: {
        agentSandbox: {
          provider: field.provider,
          sealosdevbox: { baseUrl: 'https://sealos.example.test' },
          opensandbox: {
            baseUrl: 'https://opensandbox.example.test',
            volumeManagerUrl: 'https://volume.example.test'
          }
        }
      }
    });
    mocks.effectiveConfig = baseline;
    await act(async () => root.render(React.createElement(AgentSandbox)));
    expect(mocks.inputs.has(field.name)).toBe(true);
    await act(async () => mocks.inputs.get(field.name)!({ target: { value: draft } }));
    await act(async () => mocks.changeProvider!(target));
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    return { baseline, submitted: { ...baseline, ...mocks.patch.mock.calls[0][0] } };
  };

  it.each(fields.flatMap((field) => ['none', field.other].map((target) => ({ field, target }))))(
    'restores $field.name when switching to $target with an incomplete URL',
    async ({ field, target }) => {
      const { baseline, submitted } = await saveDraft({ field, target, draft: 'https://' });
      expect(SubserviceConfigSchema.parse(submitted).agentSandbox).toEqual({
        ...baseline.agentSandbox,
        provider: target
      });
    }
  );

  it.each(['https://draft.example.test/path?version=1', ''])(
    'preserves a valid hidden draft or explicit clear: %j',
    async (draft) => {
      const field = fields[2];
      const { baseline, submitted } = await saveDraft({ field, target: 'none', draft });
      expect(SubserviceConfigSchema.parse(submitted).agentSandbox).toEqual({
        ...baseline.agentSandbox,
        provider: 'none',
        opensandbox: { ...baseline.agentSandbox.opensandbox, volumeManagerUrl: draft }
      });
    }
  );

  it.each(fields)('retains invalid active input for server rejection: $name', async (field) => {
    const { submitted } = await saveDraft({ field, target: field.provider, draft: 'https://' });
    const result = SubserviceConfigSchema.safeParse(submitted);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.join('.') === field.name)).toBe(true);
    }
  });
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

  it.each([
    { Component: CodeSandbox, field: 'codeSandbox' },
    { Component: Mcp, field: 'mcp' }
  ])('explains an invalid $field base URL before saving', async ({ Component, field }) => {
    const defaults = resolveDomainEffectiveConfig({ domain: 'subservice', overrides: {} });
    mocks.effectiveConfig = {
      ...defaults,
      codeSandbox: { enabled: true, url: 'https://user:secret@sandbox.test', token: '******' },
      mcp: { enabled: true, sseProxyUrl: 'https://mcp.test?key=value' }
    };
    await act(async () => root.render(React.createElement(Component)));
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch, field).not.toHaveBeenCalled();
    expect(container.textContent).toContain('admin:invalid_subservice_base_url');
  });

  it('allows disabling MCP SSE even when a hidden invalid draft URL was left in the input', async () => {
    mocks.effectiveConfig = resolveDomainEffectiveConfig({ domain: 'subservice', overrides: {} });
    await act(async () => root.render(React.createElement(Mcp)));

    await clickSwitch('enable_mcp_sse');
    const urlInput = container.querySelector<HTMLInputElement>('[data-service="mcpSse"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value'
      )?.set;
      setter?.call(urlInput, 'not-a-valid-url');
      urlInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      urlInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });

    await clickSwitch('enable_mcp_sse');
    await act(async () => {
      await mocks.save!();
    });

    expect(mocks.patch).toHaveBeenCalledWith({
      mcp: { enabled: false, sseProxyUrl: '' }
    });
  });
});
