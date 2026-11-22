import { createCipheriv } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunOutlinkRuntimeProps } from '@fastgpt/service/support/outLink/runtime/type';
import type { WechatAppType } from '@fastgpt/global/support/outLink/type';
import type { WechatReplyJobData } from '@fastgpt/dal/redis/bullmq/services/wechat';
import { initWechatPollWorker } from '@fastgpt/service/support/outLink/wechat/mq';
import generate from '@/pages/api/support/outLink/wechat/qrcode/generate';
import status from '@/pages/api/support/outLink/wechat/qrcode/status';
import logout from '@/pages/api/support/outLink/wechat/logout';
import { createMockIlink } from './mockIlink';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  providerConfig: vi.fn(),
  readQr: vi.fn(),
  saveQr: vi.fn(),
  findChannel: vi.fn(),
  updateChannel: vi.fn(),
  exists: vi.fn(),
  getPollWorker: vi.fn(),
  getReplyWorker: vi.fn(),
  enqueuePoll: vi.fn(),
  enqueueReply: vi.fn(),
  resetFailures: vi.fn(),
  upload: vi.fn(),
  runWorkflow: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/publish/authLink', () => ({
  authOutLinkCrud: mocks.auth,
  loadOutlinkProviderConfig: mocks.providerConfig
}));
vi.mock('@fastgpt/service/support/outLink/schema', () => ({
  MongoOutLink: {
    find: () => ({ lean: async () => [] }),
    findOne: () => ({ lean: mocks.findChannel }),
    updateOne: mocks.updateChannel,
    exists: mocks.exists
  }
}));
vi.mock('@fastgpt/dal/redis/caches', () => ({
  WECHAT_QR_LOGIN_TTL_SECONDS: 480,
  wechatQrLoginCache: { get: mocks.readQr, set: mocks.saveQr },
  wechatPollingFailureCache: { reset: mocks.resetFailures }
}));
vi.mock('@fastgpt/dal/redis/bullmq', () => ({
  defaultWorkerOptions: {},
  WECHAT_POLL_JOB_NAME: 'wechatPublishPoll',
  wechatMQService: {
    getPollWorker: mocks.getPollWorker,
    getReplyWorker: mocks.getReplyWorker,
    addPollJob: mocks.enqueuePoll,
    addReplyJob: mocks.enqueueReply,
    getReplyJob: async () => undefined
  }
}));
vi.mock('@fastgpt/service/support/outLink/runtime/service', () => ({
  runOutlinkRuntime: mocks.runWorkflow
}));
vi.mock('@fastgpt/service/support/outLink/tools', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/outLink/tools')>()),
  uploadOutLinkFile: mocks.upload
}));

const outLinkId = '68ad85a7463006c963799a05';
const shareId = 'mock-wechat-channel';
const appId = '68ad85a7463006c963799a06';
const res = { setHeader: vi.fn() };
const slot = ({ outLinkId, tmbId, attemptId }: Record<string, string>) =>
  JSON.stringify([outLinkId, tmbId, attemptId]);

describe('WeChat personal channel with mock iLink', () => {
  let ilink: ReturnType<typeof createMockIlink>;
  let app: Partial<WechatAppType>;
  let runPoll: (job: { data: { shareId: string } }) => Promise<unknown>;
  let runReply: (job: { data: WechatReplyJobData; timestamp: number }) => Promise<void>;
  let replies: WechatReplyJobData[];

  beforeEach(async () => {
    vi.resetAllMocks();
    ilink = createMockIlink();
    vi.stubGlobal('fetch', ilink.fetch);
    app = {};
    replies = [];
    const getChannel = () => ({ _id: outLinkId, appId, shareId, type: 'wechat', app: { ...app } });
    const qrCache = new Map<string, unknown>();
    mocks.auth.mockImplementation(async () => ({ outLink: getChannel(), tmbId: 'mock-member' }));
    mocks.findChannel.mockImplementation(async () => getChannel());
    mocks.providerConfig.mockImplementation(async ({ appSchema }) => ({
      ...getChannel(),
      app: appSchema.parse(app)
    }));
    mocks.readQr.mockImplementation(async (key) => qrCache.get(slot(key)));
    mocks.saveQr.mockImplementation(async ({ data, ...key }) => {
      qrCache.set(slot(key), data);
    });
    mocks.updateChannel.mockImplementation(async (filter, { $set, $unset }) => {
      for (const [path, expected] of Object.entries(filter)) {
        if (!path.startsWith('app.')) continue;
        const value = app[path.slice(4) as keyof WechatAppType];
        if (typeof expected === 'object' && expected !== null && '$ne' in expected) {
          if (value === expected.$ne) return { matchedCount: 0, modifiedCount: 0 };
        } else if (value !== expected) {
          return { matchedCount: 0, modifiedCount: 0 };
        }
      }
      for (const [path, value] of Object.entries($set)) {
        Object.assign(app, { [path.slice(4)]: value });
      }
      for (const path of Object.keys($unset ?? {})) {
        delete app[path.slice(4) as keyof WechatAppType];
      }
      return { matchedCount: 1, modifiedCount: 1 };
    });
    mocks.getPollWorker.mockImplementation((processor) => {
      runPoll = processor;
      return { on: vi.fn() };
    });
    mocks.getReplyWorker.mockImplementation((processor) => {
      runReply = processor;
    });
    mocks.enqueuePoll.mockResolvedValue({ id: 'mock-poll-job' });
    mocks.enqueueReply.mockImplementation(async (message: WechatReplyJobData) =>
      replies.push(message)
    );
    mocks.upload.mockResolvedValue({ key: 'mock-attachment' });
    await initWechatPollWorker();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await ilink.close();
  });

  it('scans, binds, receives text and encrypted media, sends a reply and logs out', async () => {
    const qr = await generate({ body: { outLinkId } } as any);
    const query = { outLinkId, attemptId: qr.attemptId };
    const getStatus = () => status({ query } as any, res as any);

    await expect(getStatus()).resolves.toEqual({ status: 'wait' });
    ilink.scan(qr.qrcode);
    await expect(getStatus()).resolves.toEqual({ status: 'scaned' });
    ilink.confirm(qr.qrcode);
    await expect(getStatus()).resolves.toEqual({ status: 'confirmed' });
    expect(app).toMatchObject({ token: ilink.token, status: 'online', bindingId: qr.attemptId });
    expect(mocks.enqueuePoll).toHaveBeenCalledWith(
      { shareId },
      expect.objectContaining({ jobId: `wechat-poll:${shareId}` })
    );

    const key = Buffer.from('0123456789abcdef');
    const plain = Buffer.from('mock report');
    const cipher = createCipheriv('aes-128-ecb', key, null);
    const mediaUrl = ilink.media(
      '/c2c/mock-report',
      Buffer.concat([cipher.update(plain), cipher.final()])
    );
    ilink.receive({
      message_id: '18446744073709551615',
      message_type: 1,
      from_user_id: 'mock-wechat-user',
      context_token: 'mock-context',
      item_list: [
        { type: 1, text_item: { text: 'please read' } },
        {
          type: 4,
          file_item: {
            file_name: 'report.pdf',
            media: { full_url: mediaUrl, aes_key: key.toString('base64') }
          },
          // 混合字段时仍只读取 FILE 对应的媒体。
          image_item: { media: { full_url: 'https://novac2c.cdn.weixin.qq.com/c2c/unused' } }
        }
      ]
    });
    mocks.runWorkflow.mockImplementation(
      async ({ message, respond }: RunOutlinkRuntimeProps<WechatAppType>) => {
        expect(message.messageId).toBe('18446744073709551615');
        await expect(
          message.resolveQuery?.({ maxFileAmount: 1, maxBytesPerFile: 2048 })
        ).resolves.toEqual([
          { text: { content: 'please read' } },
          { file: { type: 'document', name: 'report.pdf', url: '', key: 'mock-attachment' } }
        ]);
        await respond(
          (async function* () {
            yield { type: 'done' as const, content: 'mock reply' };
          })()
        );
        return { status: 'handled' };
      }
    );

    await expect(runPoll({ data: { shareId } })).resolves.toBe('messages');
    expect(ilink.requests[0].get_updates_buf).toBe('');
    expect(app.syncBuf).toBe('cursor-1');
    expect(replies).toHaveLength(1);
    await runReply({ data: replies[0], timestamp: Date.now() });
    expect(mocks.upload).toHaveBeenCalledWith(expect.objectContaining({ source: plain }));
    expect(ilink.replies).toEqual([
      expect.objectContaining({
        to_user_id: 'mock-wechat-user',
        context_token: 'mock-context',
        item_list: [{ type: 1, text_item: { text: 'mock reply' } }]
      })
    ]);

    await expect(getStatus()).resolves.toEqual({ status: 'confirmed' });
    expect(app.syncBuf).toBe('cursor-1');
    await logout({ body: { outLinkId } } as any);
    await expect(runPoll({ data: { shareId } })).resolves.toBe('stopped');
    await expect(getStatus()).resolves.toEqual({ status: 'expired' });
  });
});
