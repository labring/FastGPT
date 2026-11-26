import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  feConfigs: {
    mcpServerProxyEndpoint: '',
    customApiDomain: 'https://api.example.com',
    systemTitle: 'FastGPT'
  }
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: mocks.feConfigs })
}));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: any) => React.createElement('div', null, children),
  Flex: ({ children }: any) => React.createElement('div', null, children),
  HStack: ({ children }: any) => React.createElement('div', null, children),
  ModalBody: ({ children }: any) => React.createElement('div', null, children)
}));
vi.mock('@fastgpt/web/components/common/MyModal', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@fastgpt/web/components/common/MyBox/FormLabel', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@fastgpt/web/components/common/String/CopyBox', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@fastgpt/web/components/common/Icon/button', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Tabs/LightRowTabs', () => ({
  default: ({ list, value, onChange }: any) =>
    React.createElement(
      'div',
      null,
      list.map((item: any) =>
        React.createElement(
          'button',
          {
            key: item.value,
            'data-value': item.value,
            'aria-selected': item.value === value,
            onClick: () => onChange(item.value)
          },
          item.label
        )
      )
    )
}));

import UsageWay from '@/pageComponents/dashboard/mcp/usageWay';

let dom: JSDOM;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://site.example.com' });
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('location', dom.window.location);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mocks.feConfigs.mcpServerProxyEndpoint = '';
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('MCP usage methods', () => {
  it('hides SSE until configured and falls back to HTTP if it becomes unavailable', async () => {
    const render = () =>
      root.render(
        React.createElement(UsageWay, {
          mcp: { key: 'sample-key', _id: 'sample-id' } as any,
          onClose: () => {}
        })
      );
    await act(async () => render());
    expect(container.querySelector('[data-value="sse"]')).toBeNull();
    expect(container.textContent).toContain('https://api.example.com/mcp/app/sample-key/mcp');

    mocks.feConfigs.mcpServerProxyEndpoint = 'https://sse.example.com/';
    await act(async () => render());
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[data-value="sse"]')!.click()
    );
    expect(container.textContent).toContain('https://sse.example.com/sample-key/sse');

    mocks.feConfigs.mcpServerProxyEndpoint = '';
    await act(async () => render());
    expect(container.querySelector('[data-value="sse"]')).toBeNull();
    expect(container.querySelector('[data-value="http"]')?.getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(container.textContent).toContain('https://api.example.com/mcp/app/sample-key/mcp');
  });
});
