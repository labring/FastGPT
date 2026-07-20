import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { serviceEnv } from '@fastgpt/service/env';

import {
  buildSandboxPreviewFileUrl,
  createSandboxPreviewTicket,
  resolveSandboxPreviewPath,
  verifySandboxPreviewTicket
} from '@fastgpt/service/core/ai/sandbox/application/preview';

const originalProxySecret = serviceEnv.AGENT_SANDBOX_PROXY_SECRET;
const originalProxyUrl = serviceEnv.AGENT_SANDBOX_PROXY_URL;
const originalProvider = serviceEnv.AGENT_SANDBOX_PROVIDER;

describe('sandbox preview application', () => {
  beforeEach(() => {
    serviceEnv.AGENT_SANDBOX_PROXY_SECRET = 'preview-secret-1234567890-1234567890';
    serviceEnv.AGENT_SANDBOX_PROXY_URL = 'wss://agent-proxy.example.com/base/';
    serviceEnv.AGENT_SANDBOX_PROVIDER = 'opensandbox';
  });

  afterEach(() => {
    serviceEnv.AGENT_SANDBOX_PROXY_SECRET = originalProxySecret;
    serviceEnv.AGENT_SANDBOX_PROXY_URL = originalProxyUrl;
    serviceEnv.AGENT_SANDBOX_PROVIDER = originalProvider;
  });

  it('signs and verifies read-only preview claims', () => {
    const ticket = createSandboxPreviewTicket({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1',
      chatId: 'chat-1'
    });

    expect(verifySandboxPreviewTicket(ticket)).toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1',
      chatId: 'chat-1',
      channel: 'preview',
      permission: 'read'
    });
  });

  it('builds an HTTPS proxy URL and encodes each workspace path segment', () => {
    expect(
      buildSandboxPreviewFileUrl({
        ticket: 'header.payload.signature',
        filePath: '/workspace/test dir/预览.html'
      })
    ).toBe(
      'https://agent-proxy.example.com/base/preview/header.payload.signature/test%20dir/%E9%A2%84%E8%A7%88.html'
    );
  });

  it('normalizes relative and workspace absolute paths', () => {
    expect(resolveSandboxPreviewPath('./dir/file.txt')).toEqual({
      providerPath: '/workspace/dir/file.txt',
      relativePath: 'dir/file.txt'
    });
    expect(resolveSandboxPreviewPath('/workspace/dir/file.txt')).toEqual({
      providerPath: '/workspace/dir/file.txt',
      relativePath: 'dir/file.txt'
    });
  });

  it('rejects workspace roots, traversal, outside absolute paths and noncanonical segments', () => {
    expect(() => resolveSandboxPreviewPath('.')).toThrow('Invalid sandbox preview path');
    expect(() => resolveSandboxPreviewPath('../secret')).toThrow('Path traversal detected');
    expect(() => resolveSandboxPreviewPath('/etc/passwd')).toThrow(
      'Sandbox path is outside workspace'
    );
    expect(() => resolveSandboxPreviewPath('dir//file')).toThrow('Invalid sandbox preview path');
    expect(() => resolveSandboxPreviewPath('dir\\file')).toThrow('Invalid sandbox preview path');
  });
});
