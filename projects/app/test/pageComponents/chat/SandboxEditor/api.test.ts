import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadSandbox, readSandboxFile } from '@/pageComponents/chat/SandboxEditor/api';

const transport = vi.hoisted(() => ({ session: vi.fn(), raw: vi.fn() }));
vi.mock('@fastgpt/web/common/auth/session', () => ({ fetchWithSession: transport.session }));
vi.mock('@/web/common/api/request', () => ({ POST: vi.fn(), POSTRawFile: vi.fn() }));

const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  transport.session.mockImplementation(async () => new Response('file bytes'));
  transport.raw.mockImplementation(async () => new Response('file bytes'));
  vi.stubGlobal('fetch', transport.raw);
  vi.stubGlobal('window', {
    URL: { createObjectURL: vi.fn(() => 'blob:file'), revokeObjectURL: vi.fn() }
  });
  vi.stubGlobal('document', { createElement: vi.fn(() => anchor), body: { appendChild: vi.fn() } });
});
afterEach(() => vi.unstubAllGlobals());

describe('sandbox file transport', () => {
  it.each([
    { read: true, share: false },
    { read: false, share: false },
    { read: true, share: true },
    { read: false, share: true }
  ])(
    'renews user sessions and preserves explicit share auth: $read / $share',
    async ({ read, share }) => {
      const data = {
        appId: '65f000000000000000000001',
        chatId: 'chat-session',
        path: 'file.txt',
        ...(share ? { outLinkAuthData: { shareId: 'share-id', outLinkUid: 'visitor' } } : {})
      };
      if (read) expect(new TextDecoder().decode(await readSandboxFile(data))).toBe('file bytes');
      else {
        await downloadSandbox(data);
        expect(anchor.click).toHaveBeenCalledOnce();
      }
      const chosen = share ? transport.raw : transport.session;
      expect(chosen).toHaveBeenCalledOnce();
      expect(share ? transport.session : transport.raw).not.toHaveBeenCalled();
      const body = JSON.parse(chosen.mock.calls[0][1].body);
      expect(body.appId).toBe(share ? undefined : data.appId);
      expect(body.path).toBe('file.txt');
    }
  );
});
