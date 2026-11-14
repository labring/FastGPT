import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProbeConnectionResponse } from '@fastgpt/global/openapi/admin/system/instanceConfig/probe';

const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/web/common/api/request', () => ({ POST: mocks.post }));
vi.mock('@fastgpt/web/hooks/useSafeTranslation', () => ({
  useSafeTranslation: () => ({ t: (key: string) => key })
}));
vi.mock('@chakra-ui/react', () => ({
  Box: ({ children }: any) => React.createElement('div', null, children),
  HStack: ({ children }: any) => React.createElement('div', null, children),
  Tag: ({ children }: any) => React.createElement('span', null, children),
  Text: ({ children }: any) => React.createElement('span', null, children),
  Input: React.forwardRef(function Input({ value, onChange, placeholder }: any, ref: any) {
    return React.createElement('input', { ref, value, onChange, placeholder });
  }),
  Button: ({ children, onClick, isDisabled, isLoading }: any) =>
    React.createElement(
      'button',
      { onClick, disabled: isDisabled, 'data-loading': isLoading },
      children
    )
}));
vi.mock('@/pageComponents/admin/settings/AdminReadonlyInput', () => ({
  default: ({ value }: any) => React.createElement('span', null, value)
}));

import ConnectivityTestInput from '@/pageComponents/admin/settings/ConnectivityTestInput';

let dom: JSDOM;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('navigator', dom.window.navigator);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  mocks.post.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
  vi.unstubAllGlobals();
});

describe('ConnectivityTestInput', () => {
  it('tests the latest sandbox credentials and ignores an older response after they change', async () => {
    let resolveOld!: (value: ProbeConnectionResponse) => void;
    mocks.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    mocks.post.mockResolvedValueOnce({ connected: true, status: 200, responseTimeMs: 12 });

    const render = (token: string, value = 'http://sandbox') =>
      root.render(
        React.createElement(ConnectivityTestInput, {
          isEditable: true,
          service: 'codeSandbox',
          value,
          token
        })
      );
    await act(async () => render('******'));
    await act(async () => container.querySelector('button')!.click());
    expect(mocks.post).toHaveBeenNthCalledWith(1, '/admin/system/config/probe', {
      url: 'http://sandbox',
      timeoutMs: 5000,
      service: 'codeSandbox',
      token: '******'
    });

    await act(async () => render('draft-token'));
    await act(async () => container.querySelector('button')!.click());
    expect(mocks.post).toHaveBeenNthCalledWith(2, '/admin/system/config/probe', {
      url: 'http://sandbox',
      timeoutMs: 5000,
      service: 'codeSandbox',
      token: 'draft-token'
    });
    expect(container.textContent).toContain('admin:probe_connected');
    expect(container.textContent).toContain('12ms');

    await act(async () =>
      resolveOld({ connected: false, responseTimeMs: 0, errorCode: 'refused' })
    );
    expect(container.textContent).toContain('admin:probe_connected');
    expect(container.textContent).not.toContain('admin:probe_error_refused');
    await act(async () => render('draft-token', 'http://new-sandbox'));
    expect(container.textContent).not.toContain('admin:probe_connected');
  });

  it('keeps generic probes compatible and omits credentials for MCP probes', async () => {
    mocks.post.mockResolvedValue({ connected: false, responseTimeMs: 7, errorCode: 'response' });
    await act(async () =>
      root.render(
        React.createElement(ConnectivityTestInput, {
          value: 'http://provider',
          testPath: '/health',
          isEditable: true
        })
      )
    );
    await act(async () => container.querySelector('button')!.click());
    expect(mocks.post).toHaveBeenLastCalledWith('/admin/system/config/probe', {
      url: 'http://provider/health',
      timeoutMs: 5000
    });
    expect(container.textContent).toContain('admin:probe_error_response');

    await act(async () =>
      root.render(
        React.createElement(ConnectivityTestInput, {
          value: 'http://mcp',
          service: 'mcpSse',
          token: 'not-sent',
          isEditable: true
        })
      )
    );
    expect(container.textContent).not.toContain('admin:probe_error_response');
    await act(async () => container.querySelector('button')!.click());
    expect(mocks.post).toHaveBeenLastCalledWith('/admin/system/config/probe', {
      url: 'http://mcp',
      timeoutMs: 5000,
      service: 'mcpSse'
    });
  });

  it('does not revive a pending result after credentials change away and back', async () => {
    let resolveOld!: (value: ProbeConnectionResponse) => void;
    mocks.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        })
    );
    const render = (token: string) =>
      root.render(
        React.createElement(ConnectivityTestInput, {
          value: 'http://sandbox',
          service: 'codeSandbox',
          token,
          isEditable: true
        })
      );
    await act(async () => render('first'));
    await act(async () => container.querySelector('button')!.click());
    await act(async () => render('second'));
    await act(async () => render('first'));
    await act(async () => resolveOld({ connected: true, status: 200, responseTimeMs: 4 }));
    expect(container.textContent).not.toContain('admin:probe_connected');
    expect(container.querySelector('button')?.getAttribute('data-loading')).toBe('false');
  });
});
