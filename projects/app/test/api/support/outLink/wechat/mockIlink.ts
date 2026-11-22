import { MockAgent } from 'undici';
import type {
  QRStatusResponse,
  WeixinMessage
} from '@fastgpt/service/support/outLink/wechat/ilinkClient';

const origin = 'https://ilinkai.weixin.qq.com';
const mediaOrigin = 'https://novac2c.cdn.weixin.qq.com';

/** 在测试进程内模拟 iLink HTTP，所有未登记请求均被拒绝。 */
export function createMockIlink() {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const bot = agent.get(origin);
  const sessions = new Map<string, QRStatusResponse>();
  const messages: WeixinMessage[] = [];
  const requests: { get_updates_buf: string }[] = [];
  const replies: { to_user_id: string; context_token: string; item_list: unknown[] }[] = [];
  const token = 'mock-ilink-token';
  const headers = { authorization: `Bearer ${token}` };

  bot
    .intercept({ method: 'POST', path: '/ilink/bot/get_bot_qrcode', query: { bot_type: '3' } })
    .reply(200, () => {
      const qrcode = `qr-${sessions.size + 1}`;
      sessions.set(qrcode, { status: 'wait' });
      return { qrcode, qrcode_img_content: `mock-wechat://scan/${qrcode}` };
    })
    .persist();

  bot
    .intercept({ path: /^\/ilink\/bot\/get_qrcode_status\?qrcode=/ })
    .reply(200, ({ path }) => {
      const qrcode = new URL(path, origin).searchParams.get('qrcode') ?? '';
      return sessions.get(qrcode) ?? { status: 'expired' };
    })
    .persist();

  bot
    .intercept({ method: 'POST', path: '/ilink/bot/getupdates', headers })
    .reply(200, ({ body }) => {
      requests.push(JSON.parse(String(body)));
      return { ret: 0, get_updates_buf: `cursor-${requests.length}`, msgs: messages.splice(0) };
    })
    .persist();

  bot
    .intercept({ method: 'POST', path: '/ilink/bot/sendmessage', headers })
    .reply(200, ({ body }) => {
      replies.push(JSON.parse(String(body)).msg);
      return { ret: 0 };
    })
    .persist();

  const fetch = globalThis.fetch;
  return {
    fetch: (input: string, init: RequestInit) => {
      // 只替换测试进程的实际连接器，仍经过生产客户端的 URL 检查和协议处理。
      const options = { ...init, dispatcher: agent };
      return fetch(input, options);
    },
    close: () => agent.close(),
    token,
    requests,
    replies,
    scan: (qrcode: string) => sessions.set(qrcode, { status: 'scaned' }),
    confirm: (qrcode: string) =>
      sessions.set(qrcode, {
        status: 'confirmed',
        bot_token: token,
        ilink_bot_id: 'mock-ilink-bot',
        ilink_user_id: 'mock-ilink-owner',
        baseurl: origin
      }),
    receive: (message: WeixinMessage) => messages.push(message),
    media: (path: string, bytes: Buffer) => {
      agent
        .get(mediaOrigin)
        .intercept({ path })
        .reply(200, bytes, { headers: { 'content-type': 'application/octet-stream' } });
      return new URL(path, mediaOrigin).href;
    }
  };
}
