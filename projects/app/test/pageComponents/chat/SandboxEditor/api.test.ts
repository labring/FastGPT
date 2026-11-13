import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downloadSandbox,
  getFilePreviewLink,
  getSandboxTerminalTicket,
  readSandboxFile,
  uploadSandboxFile
} from '@/pageComponents/chat/SandboxEditor/api';
import { instance } from '@/web/common/api/request';

const systemMocks = vi.hoisted(() => ({
  subRoute: ''
}));

vi.mock('@/web/support/user/auth', () => ({ clearToken: vi.fn() }));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: { getState: () => ({ setNotSufficientModalType: vi.fn() }) }
}));
vi.mock('@fastgpt/web/common/system/utils', () => ({
  getWebReqUrl: (path: string) => `${systemMocks.subRoute}${path}`,
  get subRoute() {
    return systemMocks.subRoute;
  }
}));
vi.mock('@fastgpt/web/i18n/utils', () => ({
  getLanguageRequestHeaders: () => ({ 'Accept-Language': 'zh-CN' })
}));

const target = { appId: 'app-1', chatId: 'chat-1', path: '文件/data.bin' };
const shareAuth = { shareId: 'share-1', outLinkUid: 'visitor-1' };

describe('SandboxEditor raw file transport', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    systemMocks.subRoute = '';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves every binary byte, the response ETag, subRoute prefix, and language headers', async () => {
    systemMocks.subRoute = '/fastgpt';
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    fetchMock.mockResolvedValue(
      new Response(bytes, {
        headers: { ETag: '"file-version-1"', 'Content-Length': '99999' }
      })
    );

    const result = await readSandboxFile({ ...target, outLinkAuthData: shareAuth });

    expect(result).toEqual({ bytes, etag: '"file-version-1"', size: bytes.byteLength });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/fastgpt/api/core/ai/sandbox/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': 'zh-CN'
      },
      body: JSON.stringify({ ...target, appId: undefined, outLinkAuthData: shareAuth })
    });
  });

  it('reads empty files without requiring ETag or Content-Length headers', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array()));

    await expect(readSandboxFile(target)).resolves.toEqual({
      bytes: new Uint8Array(),
      etag: undefined,
      size: 0
    });
  });

  it('rejects failed raw downloads with HTTP status and parsed JSON message', async () => {
    fetchMock.mockResolvedValueOnce(new Response('File not found', { status: 404 }));

    await expect(readSandboxFile(target)).rejects.toMatchObject({
      message: 'Read failed',
      status: 404
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Sandbox session expired' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      })
    );
    await expect(downloadSandbox(target)).rejects.toMatchObject({
      message: 'Sandbox session expired',
      status: 503
    });
  });

  it('requests a terminal ticket and WebSocket endpoint via /core/ai/sandbox/getTicket', async () => {
    const ticketResponse = {
      url: 'wss://sandbox-proxy.example.com/terminal',
      ticket: 'jwt-ticket-123',
      ptySessionId: 'pty-session-1',
      reused: true
    };
    const requestSpy = vi.spyOn(instance, 'request').mockResolvedValue({
      data: { code: 200, data: ticketResponse }
    });

    await expect(
      getSandboxTerminalTicket({
        skillId: 'skill-1',
        chatId: 'chat-1',
        cols: 120,
        rows: 36
      })
    ).resolves.toEqual(ticketResponse);

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/core/ai/sandbox/getTicket',
        data: {
          skillId: 'skill-1',
          chatId: 'chat-1',
          cols: 120,
          rows: 36
        }
      })
    );
  });

  it('uploads a UTF-8 Blob and serializes oldEtag with the existing share metadata', async () => {
    const content = '你好，sandbox 🌍\r\nconst value = "日本語";\n';
    const file = new Blob([content]);
    const oldEtag = 'W/"version +/?=1"';
    const saved = { path: target.path, bytesWritten: file.size, etag: '"version-2"' };
    const requestSpy = vi.spyOn(instance, 'request').mockResolvedValue({
      data: { code: 200, data: saved }
    });

    await expect(
      uploadSandboxFile({ ...target, outLinkAuthData: shareAuth, file, oldEtag })
    ).resolves.toEqual(saved);

    expect(requestSpy).toHaveBeenCalledOnce();
    const [request] = requestSpy.mock.calls[0];
    expect(request).toEqual(
      expect.objectContaining({
        method: 'POST',
        data: file,
        headers: { 'Content-Type': 'application/octet-stream' },
        timeout: 10 * 60 * 1000
      })
    );
    expect(request.data).toBe(file);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new TextEncoder().encode(content));
    const url = new URL(request.url!, 'http://localhost');
    expect(url.pathname).toBe('/core/ai/sandbox/upload');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      chatId: target.chatId,
      path: target.path,
      oldEtag,
      outLinkAuthData: JSON.stringify(shareAuth)
    });
  });

  it('requests a generic preview URL and retains the server expiry time', async () => {
    const preview = {
      url: 'https://fastgpt.example.com/preview/session/file.png?token=abc',
      expiresAt: Date.now() + 2 * 60 * 60 * 1000
    };
    const requestSpy = vi.spyOn(instance, 'request').mockResolvedValue({
      data: { code: 200, data: preview }
    });

    await expect(
      getFilePreviewLink({
        appId: target.appId,
        chatId: target.chatId,
        filePath: 'file.png',
        outLinkAuthData: shareAuth
      })
    ).resolves.toEqual(preview);
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/core/ai/sandbox/getFilePreviewLink',
        data: { chatId: target.chatId, filePath: 'file.png', outLinkAuthData: shareAuth }
      })
    );
  });

  it('keeps ordinary File uploads as raw binary bodies without adding oldEtag', async () => {
    const bytes = new Uint8Array([0, 255, 128, 13, 10]);
    const file = new File([bytes], 'data.bin');
    const requestSpy = vi.spyOn(instance, 'request').mockResolvedValue({
      data: { code: 200, data: { path: target.path, bytesWritten: file.size } }
    });

    await uploadSandboxFile({ ...target, file });

    const [request] = requestSpy.mock.calls[0];
    expect(request.data).toBe(file);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(bytes);
    expect(new URL(request.url!, 'http://localhost').searchParams.has('oldEtag')).toBe(false);
  });
});
