import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  post: vi.fn(),
  fetch: vi.fn()
}));

vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/web/common/api/request', () => ({ POST: mocks.post, POSTRawFile: vi.fn() }));
vi.mock('@/pageComponents/chat/SandboxEditor/modal', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children?: React.ReactNode }) => children ?? null
}));
vi.mock('@/web/core/chat/context/chatRecordContext', () => ({
  ChatRecordContext: React.createContext({ chatRecords: [], isChatRecordsLoaded: false })
}));

import { useSandboxFileStore } from '@/pageComponents/chat/SandboxEditor/hook';

type RpcRequest = { id: number; method: string; params?: Record<string, unknown> };
type RpcReply = { result?: unknown; error?: { code?: number; message: string } } | null;

class FakeWebSocket {
  static readonly OPEN = 1;
  static responder: (req: RpcRequest) => RpcReply = () => ({ result: {} });

  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  constructor() {
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(raw: string) {
    const req = JSON.parse(raw) as RpcRequest;
    const reply = FakeWebSocket.responder(req);
    if (!reply) return;
    queueMicrotask(() => {
      if (this.readyState !== FakeWebSocket.OPEN) return;
      this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: req.id, ...reply }) });
    });
  }

  close() {
    this.readyState = 3;
  }
}

describe('useSandboxFileStore failure toasts', () => {
  let dom: JSDOM;
  let root: Root;
  let store: ReturnType<typeof useSandboxFileStore>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const mountStore = async () => {
    const sandboxTarget = { skillId: 'skill-1' };
    const Harness = () => {
      store = useSandboxFileStore({ sandboxTarget, chatId: 'edit-debug' });
      return null;
    };
    root = createRoot(document.createElement('div'));
    await act(async () => root.render(React.createElement(Harness)));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('fetch', mocks.fetch);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

    mocks.post.mockResolvedValue({
      wsUrl: 'ws://sandbox.local/fs?ticket=test',
      maxFileBytes: 10 * 1024 * 1024,
      workspaceRoot: '/home/sandbox/workspace',
      sessionWorkDirectory: '/home/sandbox/workspace'
    });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    consoleErrorSpy.mockRestore();
    if (root) await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('toasts and rolls back the temporary tab when openFile fails', async () => {
    FakeWebSocket.responder = (req) => {
      if (req.method === 'fs/read_dir_recursive')
        return { result: { files: [], expandedPaths: [] } };
      if (req.method === 'fs/read_file' && req.params?.path === 'ok.txt') {
        return { result: { content: Buffer.from('ok').toString('base64'), etag: 'sha256:ok' } };
      }
      return { error: { code: -32603, message: 'Permission denied' } };
    };

    await mountStore();
    await act(async () => {
      await store.openFile('ok.txt');
      await store.openFile('broken.txt');
    });

    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: 'chat:sandbox_open_file_failed',
      description: 'Permission denied',
      status: 'error'
    });
    expect(store.openedFiles.map((file) => file.path)).toEqual(['ok.txt']);
    expect(store.activeFilePath).toBe('ok.txt');
  });

  it('does not toast when an in-flight openFile is cancelled by unmount', async () => {
    FakeWebSocket.responder = (req) => {
      if (req.method === 'fs/read_dir_recursive')
        return { result: { files: [], expandedPaths: [] } };
      return null;
    };

    await mountStore();
    let pendingOpen!: Promise<void>;
    await act(async () => {
      pendingOpen = store.openFile('pending.txt');
    });
    await act(async () => {
      root.unmount();
      await pendingOpen;
    });

    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('toasts server error details and resets loading state when downloadCurrentFile fails', async () => {
    FakeWebSocket.responder = (req) => {
      if (req.method === 'fs/read_dir_recursive')
        return { result: { files: [], expandedPaths: [] } };
      return { result: { content: Buffer.from('ok').toString('base64'), etag: 'sha256:ok' } };
    };
    mocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 500, message: 'Sandbox offline' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    await mountStore();
    await act(async () => {
      await store.openFile('notes.txt');
    });
    await act(async () => {
      await store.downloadCurrentFile();
    });

    expect(mocks.toast).toHaveBeenCalledExactlyOnceWith({
      title: 'chat:sandbox_download_failed',
      description: 'Sandbox offline',
      status: 'error'
    });
    expect(store.downloadingFile).toBe(false);
  });
});
