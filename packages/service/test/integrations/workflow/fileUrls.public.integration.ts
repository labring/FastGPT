import { beforeEach, describe, expect, it } from 'vitest';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/utils/fileContext';
import {
  readWorkflowFileBuffer,
  runWithContext
} from '@fastgpt/service/core/workflow/utils/context';
import { getInputFiles } from '@fastgpt/service/core/workflow/dispatch/ai/chat/fileContext';
import { normalizeDatasetSearchInput } from '@fastgpt/service/core/workflow/dispatch/dataset/utils';
import { axios } from '@fastgpt/service/common/api/axios';
import { PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';

beforeEach(() => {
  global.systemEnv = {
    fileUrlWhitelist: ['httpbingo.org', 'httpbin.org']
  } as typeof global.systemEnv;
});

/** 仅发送公开测试 URL；production 模式运行真实安全 axios，不使用业务凭证。 */
const prepare = (url: string) =>
  prepareWorkflowFileContext({
    query: [{ file: { type: ChatFileTypeEnum.file, name: '', url } }],
    histories: [],
    scope: {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'public-file-test',
      uid: 'test',
      chatId: 'test'
    },
    maxFileAmount: 5,
    maxBytesPerFile: 1024 * 1024
  });

describe('公网真实外链（显式启用，受网络和第三方可用性影响）', () => {
  it.each([
    { url: 'https://httpbingo.org/image/png', signature: '89504e470d0a1a0a' },
    { url: 'https://httpbin.org/image/jpeg', signature: 'ffd8ff' },
    { url: 'https://httpbingo.org/redirect-to?url=%2Fimage%2Fpng', signature: '89504e470d0a1a0a' }
  ])('$url 经真实 HEAD 进入图片消息，GET 内容签名正确', async ({ url, signature }) => {
    const started = performance.now();
    const prepared = await prepare(url);
    const classifiedMs = Math.round(performance.now() - started);
    expect(prepared.query[0].file?.type).toBe(ChatFileTypeEnum.image);
    await runWithContext({ mcpClientMemory: {}, fileContext: prepared.fileContext }, async () => {
      const files = await getInputFiles({ fileLinks: [url] });
      const messages = chats2GPTMessages({
        messages: [{ obj: ChatRoleEnum.Human, value: files.map((file) => ({ file })) }]
      });
      expect(messages[0]?.content).toEqual([{ type: 'image_url', image_url: { url } }]);
      expect((await normalizeDatasetSearchInput([url])).imageQueries).toEqual([url]);
      const buffer = await readWorkflowFileBuffer({ url });
      expect(buffer.subarray(0, signature.length / 2).toString('hex')).toBe(signature);
      console.info(
        '[public-file-integration]',
        JSON.stringify({ url, type: files[0].type, classifiedMs, downloadedBytes: buffer.length })
      );
    });
  });

  it('公网无后缀 XML 文档进入 file，且正文能通过工作流文件来源真实读取', async () => {
    const url = 'https://httpbingo.org/xml';
    const prepared = await prepare(url);
    expect(prepared.query[0].file?.type).toBe(ChatFileTypeEnum.file);
    await runWithContext({ mcpClientMemory: {}, fileContext: prepared.fileContext }, async () => {
      const buffer = await readWorkflowFileBuffer({ url });
      expect(buffer.toString()).toContain('<slideshow');
      expect((await normalizeDatasetSearchInput([url])).imageQueries).toEqual([]);
      console.info('[public-file-document]', JSON.stringify({ url, bytes: buffer.length }));
    });
  });

  it('production 模式拒绝回环地址及公网跳转到回环地址', async () => {
    await expect(axios.head('http://127.0.0.1:1/private')).rejects.toThrow(PRIVATE_URL_TEXT);
    const url = 'https://httpbin.org/redirect-to?url=http%3A%2F%2F127.0.0.1%3A1%2Fprivate';
    // 先确认实际拿到公网 302，避免初始域名被拒绝也被误判为逐跳防护成功。
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000)
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:1/private');
    await expect(axios.head(url, { timeout: 5000 })).rejects.toThrow(PRIVATE_URL_TEXT);
  });
});
