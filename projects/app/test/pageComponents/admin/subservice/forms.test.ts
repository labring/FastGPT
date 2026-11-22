import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormProvider, useFormContext } from 'react-hook-form';
import { resolveDomainEffectiveConfig } from '@fastgpt/global/common/system/config/schema';
import { SubserviceConfigSchema } from '@fastgpt/global/common/system/config/schemas/subservice';
import { deepMergeConfig } from '@fastgpt/global/common/system/config/merge';
import {
  markDomainSecrets,
  omitDomainSecrets
} from '@fastgpt/global/common/system/config/permission';

import { isConfiguredSecret } from '@fastgpt/global/common/system/config/secret';

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  effectiveConfig: {} as Record<string, unknown>,
  save: undefined as undefined | (() => Promise<unknown>),
  toc: [] as { id: string }[],
  inputs: new Map<string, (value: unknown) => void>(),
  changeRuntime: undefined as undefined | ((value: string) => void)
}));
vi.mock('@/web/common/system/useDomainConfig', () => ({
  useDomainConfig: () => {
    const effectiveConfig = mocks.effectiveConfig;
    return {
      effectiveConfig: React.useMemo(
        () => omitDomainSecrets('subservice', effectiveConfig),
        [effectiveConfig]
      ),
      isSecretConfigured: (path: string) =>
        isConfiguredSecret(
          path
            .split('.')
            .reduce<any>(
              (value, key) => value?.[key],
              markDomainSecrets('subservice', mocks.effectiveConfig)
            )
        ),
      isLoading: false,
      isUpdating: false,
      patchConfig: mocks.patch
    };
  }
}));
vi.mock('@/pageComponents/admin/settings/AdminSecretInput', () => ({
  default: ({ name, value, onChange, isConfigured }: any) => {
    mocks.inputs.set(name, (event: any) => onChange(event.target.value));
    return React.createElement('input', {
      name,
      value: value ?? '',
      onChange: (event: any) => onChange(event.target.value),
      'data-configured': isConfigured && value === undefined
    });
  }
}));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: any) => React.createElement('div', null, children),
  Flex: ({ children }: any) => React.createElement('div', null, children),
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
    mocks.inputs.set(name, onChange);
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
    if (list.some(({ value }) => value === 'kubernetes')) mocks.changeRuntime = onChange;
    return null;
  }
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingPage', () => ({
  default: ({ form, children, onSave, tocItems }: any) => {
    mocks.save = onSave;
    mocks.toc = tocItems;
    return React.createElement(FormProvider, form, children);
  }
}));
vi.mock('@/pageComponents/admin/settings/AdminSettingSection', () => ({
  default: ({ children, id }: any) => React.createElement('section', { id }, children)
}));
vi.mock('@/pageComponents/admin/settings/AdminFormItem', () => ({
  default: ({ children, label, name }: any) => {
    const form = useFormContext();
    const findNames = (nodes: React.ReactNode): string[] =>
      React.Children.toArray(nodes).flatMap((node) => {
        if (!React.isValidElement<{ name?: string; children?: React.ReactNode }>(node)) return [];
        return node.props.name ? [node.props.name] : findNames(node.props.children);
      });
    const fieldNames = name ? [name] : findNames(children);
    const errorMessage = fieldNames
      .map((fieldName) => form?.getFieldState(fieldName, form.formState).error?.message)
      .find(Boolean);
    const hasInlineError = React.Children.toArray(children).some(
      (node) => React.isValidElement<{ color?: string }>(node) && node.props.color === 'red.500'
    );
    return React.createElement(
      'label',
      null,
      label,
      children,
      !hasInlineError && errorMessage
        ? React.createElement('span', { role: 'alert' }, errorMessage)
        : null
    );
  }
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
    { value, name, onChange, service, token, useStoredToken, renderLayout }: any,
    ref: any
  ) {
    mocks.inputs.set(name, onChange);
    const input = React.createElement('input', {
      ref,
      value,
      name,
      onChange,
      'data-service': service,
      'data-token': token,
      'data-use-stored-token': useStoredToken
    });
    return renderLayout
      ? renderLayout({ input, button: React.createElement('button', null, 'probe'), result: null })
      : input;
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
  mocks.changeRuntime = undefined;
});

describe('agent sandbox Kubernetes settings', () => {
  it.each([
    { enabled: false, runtime: 'kubernetes', visible: false },
    { enabled: true, runtime: 'docker', visible: false },
    { enabled: true, runtime: 'kubernetes', visible: true }
  ] as const)(
    'shows Kubernetes controls for enabled=$enabled / $runtime: $visible',
    async ({ enabled, runtime, visible }) => {
      mocks.effectiveConfig = resolveDomainEffectiveConfig({
        domain: 'subservice',
        overrides: {
          agentSandbox: {
            enabled,
            proxy: {
              wsUrl: 'wss://proxy.test',
              previewUrl: 'https://proxy.test',
              secret: 'proxy_secret_32_characters_minimum'
            },
            opensandbox: {
              baseUrl: 'https://sandbox.test',
              apiKey: 'saved-opensandbox-key',
              image: 'fastgpt-agent-sandbox:latest',
              volumeManagerUrl: 'https://volume.test',
              runtime
            }
          }
        }
      });
      await act(async () => root.render(React.createElement(AgentSandbox)));
      expect(container.textContent).not.toContain('admin:sandbox_ephemeral_storage_size');
      expect(container.textContent?.includes('admin:sandbox_cpu_overcommit_factor')).toBe(visible);
      expect(container.textContent?.includes('admin:sandbox_memory_overcommit_factor')).toBe(
        visible
      );
      if (enabled && runtime === 'docker') {
        await act(async () => mocks.changeRuntime!('kubernetes'));
        expect(container.textContent).not.toContain('admin:sandbox_ephemeral_storage_size');
        expect(container.textContent).toContain('admin:sandbox_cpu_overcommit_factor');
        expect(container.textContent).toContain('admin:sandbox_memory_overcommit_factor');
        await act(async () => mocks.changeRuntime!('docker'));
        expect(container.textContent).not.toContain('admin:sandbox_cpu_overcommit_factor');
        expect(container.textContent).not.toContain('admin:sandbox_memory_overcommit_factor');
      }
    }
  );
});

describe('agent sandbox hidden URL drafts', () => {
  const fields = [
    { name: 'agentSandbox.opensandbox.baseUrl', enabled: true, other: false },
    {
      name: 'agentSandbox.opensandbox.volumeManagerUrl',
      enabled: true,
      other: false
    }
  ] as const;

  /** 通过真实 RHF 输入回调留下草稿，再切换启用开关，检查提交值和服务端域契约。 */
  const saveDraft = async ({
    field,
    draft,
    target,
    expectPatch = true
  }: {
    field: (typeof fields)[number];
    draft: string;
    target: boolean;
    expectPatch?: boolean;
  }) => {
    const baseline = resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: {
        agentSandbox: {
          enabled: field.enabled,
          proxy: {
            wsUrl: 'wss://proxy.test',
            previewUrl: 'https://proxy.test',
            secret: 'proxy_secret_32_characters_minimum'
          },
          opensandbox: {
            baseUrl: 'https://opensandbox.example.test',
            apiKey: 'saved-opensandbox-key',
            image: 'fastgpt-agent-sandbox:latest',
            volumeManagerUrl: 'https://volume.example.test'
          }
        }
      }
    });
    mocks.effectiveConfig = baseline;
    await act(async () => root.render(React.createElement(AgentSandbox)));
    expect(mocks.inputs.has(field.name)).toBe(true);
    await act(async () => mocks.inputs.get(field.name)!({ target: { value: draft } }));
    if (target !== field.enabled) {
      await clickSwitch('enable_agent_sandbox');
    }
    await act(async () => {
      await mocks.save!();
    });
    if (expectPatch) {
      expect(mocks.patch).toHaveBeenCalledTimes(1);
    }
    return {
      baseline,
      submitted: expectPatch ? deepMergeConfig(baseline, mocks.patch.mock.calls[0][0]) : undefined
    };
  };

  it.each(fields.map((field) => ({ field, target: field.other })))(
    'restores $field.name when switching enabled=$target with an incomplete URL',
    async ({ field, target }) => {
      const { baseline, submitted } = await saveDraft({ field, target, draft: 'https://' });
      expect(SubserviceConfigSchema.parse(submitted).agentSandbox).toEqual({
        ...baseline.agentSandbox,
        enabled: target
      });
    }
  );

  it.each(['https://draft.example.test/path', ''])(
    'preserves a valid hidden draft or explicit clear: %j',
    async (draft) => {
      const field = fields[1];
      const { baseline, submitted } = await saveDraft({ field, target: false, draft });
      expect(SubserviceConfigSchema.parse(submitted).agentSandbox).toEqual({
        ...baseline.agentSandbox,
        enabled: false,
        opensandbox: { ...baseline.agentSandbox.opensandbox, volumeManagerUrl: draft }
      });
    }
  );

  it.each(fields)('rejects invalid active URL input on save: $name', async (field) => {
    await saveDraft({ field, target: field.enabled, draft: 'https://', expectPatch: false });
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(container.textContent).toContain('admin:invalid_subservice_base_url');
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
  it('hides sandbox connection and modules while disabled and retains configured credentials', async () => {
    mocks.effectiveConfig = resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: { codeSandbox: { enabled: false, url: 'http://sandbox', token: 'saved-token' } }
    });
    await act(async () => root.render(React.createElement(CodeSandbox)));
    expect(container.querySelector('[data-service="codeSandbox"]')).toBeNull();
    expect(container.querySelector('#modules')).toBeNull();
    expect(mocks.toc.map(({ id }) => id)).toEqual(['connection']);

    await clickSwitch('enable_code_sandbox');
    expect(container.querySelector<HTMLInputElement>('[data-service="codeSandbox"]')?.value).toBe(
      'http://sandbox'
    );
    expect(container.querySelector('[data-use-stored-token="true"]')).not.toBeNull();
    expect(
      container.querySelector('[name="codeSandbox.token"][data-configured="true"]')
    ).not.toBeNull();
    expect(container.querySelector('#modules')).not.toBeNull();
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith({
      codeSandbox: { enabled: true, url: 'http://sandbox' }
    });

    await clickSwitch('enable_code_sandbox');
    expect(container.querySelector('#modules')).toBeNull();
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith({
      codeSandbox: { enabled: false, url: 'http://sandbox' }
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
      codeSandbox: { enabled: false, url: '' }
    });
  });

  it('probes a replacement or explicit clear instead of the saved code sandbox token', async () => {
    mocks.effectiveConfig = resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: { codeSandbox: { enabled: true, url: 'http://sandbox', token: 'stored' } }
    });
    await act(async () => root.render(React.createElement(CodeSandbox)));
    for (const token of ['replacement', '']) {
      await act(async () => mocks.inputs.get('codeSandbox.token')!({ target: { value: token } }));
      const probe = container.querySelector('[data-service="codeSandbox"]');
      expect(probe?.getAttribute('data-token')).toBe(token);
      expect(probe?.getAttribute('data-use-stored-token')).toBe('false');
    }
    await clickSwitch('enable_code_sandbox');
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenCalledWith({
      codeSandbox: { enabled: false, url: 'http://sandbox', token: '' }
    });
  });

  it.each([
    { Component: CodeSandbox, field: 'codeSandbox' },
    { Component: Mcp, field: 'mcp' }
  ])('explains an invalid $field base URL before saving', async ({ Component, field }) => {
    const defaults = resolveDomainEffectiveConfig({ domain: 'subservice', overrides: {} });
    mocks.effectiveConfig = {
      ...defaults,
      codeSandbox: { enabled: true, url: 'https://user:secret@sandbox.test', token: 'saved-token' },
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

describe('Agent Sandbox proxy form', () => {
  it('accepts a configured proxy secret without submitting its value', async () => {
    mocks.effectiveConfig = resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: {
        agentSandbox: {
          enabled: true,
          proxy: {
            wsUrl: 'wss://proxy.test',
            previewUrl: 'https://preview.test',
            secret: 'proxy_secret_32_characters_minimum'
          },
          opensandbox: {
            baseUrl: 'https://sandbox.test',
            apiKey: 'opensandbox-api-key',
            image: 'fastgpt-agent-sandbox:latest',
            volumeManagerUrl: 'https://volume.test'
          }
        }
      }
    });
    await act(async () => root.render(React.createElement(AgentSandbox)));
    expect(
      container.querySelector('[name="agentSandbox.proxy.secret"][data-configured="true"]')
    ).not.toBeNull();
    for (const [key, service, value] of [
      ['wsUrl', 'agentSandboxWsProxy', 'wss://proxy.test'],
      ['previewUrl', 'agentSandboxPreviewProxy', 'https://preview.test']
    ]) {
      const input = container.querySelector<HTMLInputElement>(`[name="agentSandbox.proxy.${key}"]`);
      expect(input?.dataset.service).toBe(service);
      expect(input?.value).toBe(value);
      expect(input?.hasAttribute('data-token')).toBe(false);
    }
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenCalledWith(
      expect.objectContaining({
        agentSandbox: expect.objectContaining({
          proxy: { wsUrl: 'wss://proxy.test', previewUrl: 'https://preview.test' }
        })
      })
    );
  });

  it('validates new proxy and opensandbox fields when enabled and hides them while disabled', async () => {
    const defaults = resolveDomainEffectiveConfig({ domain: 'subservice', overrides: {} });
    mocks.effectiveConfig = defaults;
    await act(async () => root.render(React.createElement(AgentSandbox)));
    expect(container.querySelector('#proxy')).toBeNull();
    expect(mocks.toc.some(({ id }) => id === 'proxy')).toBe(false);
    await clickSwitch('enable_agent_sandbox');
    expect(container.querySelector('#proxy')).not.toBeNull();
    expect(container.querySelector('[name="agentSandbox.proxy.secret"]')).not.toBeNull();
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(container.textContent?.match(/admin:required/g)).toHaveLength(7);
    for (const [key, value] of Object.entries({
      wsUrl: 'wss://proxy.test',
      previewUrl: 'https://preview.test',
      secret: 'proxy_secret_32_characters_minimum'
    })) {
      await act(async () => mocks.inputs.get(`agentSandbox.proxy.${key}`)!({ target: { value } }));
    }
    for (const [key, value] of Object.entries({
      baseUrl: 'https://sandbox.test',
      apiKey: 'opensandbox-api-key',
      image: 'fastgpt-agent-sandbox:latest',
      volumeManagerUrl: 'https://volume.test'
    })) {
      await act(async () =>
        mocks.inputs.get(`agentSandbox.opensandbox.${key}`)!({ target: { value } })
      );
    }
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        agentSandbox: expect.objectContaining({
          enabled: true,
          proxy: {
            wsUrl: 'wss://proxy.test',
            previewUrl: 'https://preview.test',
            secret: 'proxy_secret_32_characters_minimum'
          }
        })
      })
    );
    await act(async () =>
      mocks.inputs.get('agentSandbox.proxy.wsUrl')!({
        target: { value: 'https://wrong-protocol.test' }
      })
    );
    await act(async () =>
      mocks.inputs.get('agentSandbox.proxy.secret')!({ target: { value: 'short' } })
    );
    mocks.patch.mockClear();
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(container.textContent).toContain('admin:sandbox_proxy_url_invalid');
    expect(container.textContent).toContain('admin:sandbox_proxy_secret_invalid');
    await clickSwitch('enable_agent_sandbox');
    await act(async () => {
      await mocks.save!();
    });
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    expect(container.querySelector('#proxy')).toBeNull();
  });

  it('wires OpenSandbox probe credentials to stored API key or explicit draft changes', async () => {
    mocks.effectiveConfig = resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: {
        agentSandbox: {
          enabled: true,
          proxy: {
            wsUrl: 'wss://proxy.test',
            previewUrl: 'https://preview.test',
            secret: 'proxy_secret_32_characters_minimum'
          },
          opensandbox: {
            baseUrl: 'http://localhost:8090',
            apiKey: 'stored-key',
            image: 'fastgpt-agent-sandbox:latest',
            volumeManagerUrl: 'http://volume-manager:8081'
          }
        }
      }
    });
    await act(async () => root.render(React.createElement(AgentSandbox)));
    const probeInput = container.querySelector('[data-service="opensandbox"]');
    expect(probeInput).not.toBeNull();
    expect(probeInput?.getAttribute('data-use-stored-token')).toBe('true');

    for (const token of ['replacement-key', '']) {
      await act(async () =>
        mocks.inputs.get('agentSandbox.opensandbox.apiKey')!({ target: { value: token } })
      );
      expect(probeInput?.getAttribute('data-token')).toBe(token);
      expect(probeInput?.getAttribute('data-use-stored-token')).toBe('false');
    }
  });

  it('wires Volume Manager probe credentials to stored token or explicit draft changes', async () => {
    mocks.effectiveConfig = resolveDomainEffectiveConfig({
      domain: 'subservice',
      overrides: {
        agentSandbox: {
          enabled: true,
          proxy: {
            wsUrl: 'wss://proxy.test',
            previewUrl: 'https://preview.test',
            secret: 'proxy_secret_32_characters_minimum'
          },
          opensandbox: {
            baseUrl: 'http://localhost:8090',
            apiKey: 'stored-key',
            image: 'fastgpt-agent-sandbox:latest',
            volumeManagerUrl: 'http://volume-manager:8081',
            volumeManagerToken: 'stored-vm-token'
          }
        }
      }
    });
    await act(async () => root.render(React.createElement(AgentSandbox)));
    const probeInput = container.querySelector('[data-service="volumeManager"]');
    expect(probeInput).not.toBeNull();
    expect(probeInput?.getAttribute('data-use-stored-token')).toBe('true');

    for (const token of ['replacement-vm-token', '']) {
      await act(async () =>
        mocks.inputs.get('agentSandbox.opensandbox.volumeManagerToken')!({
          target: { value: token }
        })
      );
      expect(probeInput?.getAttribute('data-token')).toBe(token);
      expect(probeInput?.getAttribute('data-use-stored-token')).toBe('false');
    }
  });
});
