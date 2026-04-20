import crypto from 'crypto';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const CHANNEL_VERSION = '1.0.0';
const BOT_TYPE = '3';
const LONG_POLL_TIMEOUT_MS = 35_000;
const SEND_TIMEOUT_MS = 15_000;

export type WeixinMessage = {
  msgid: string;
  from_user_id: string;
  to_user_id?: string;
  message_type: number;
  message_state?: number;
  item_list?: MessageItem[];
  context_token?: string;
  create_time_ms?: number;
};

export type MessageItem = {
  type: number;
  text_item?: { text: string };
  voice_item?: { text: string };
  ref_msg?: { title?: string };
};

export type GetUpdatesResponse = {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeixinMessage[];
  get_updates_buf?: string;
};

export type QRCodeResponse = {
  qrcode: string;
  qrcode_img_content: string;
};

export type QRStatusResponse = {
  status: 'wait' | 'scaned' | 'confirmed' | 'expired';
  bot_token?: string;
  ilink_bot_id?: string;
  baseurl?: string;
  ilink_user_id?: string;
};

export class ILinkClient {
  private baseUrl: string;
  private token?: string;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.token = token;
  }

  private randomUin(): string {
    const uint32 = crypto.randomBytes(4).readUInt32BE(0);
    return Buffer.from(String(uint32), 'utf-8').toString('base64');
  }

  private buildHeaders(body?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': this.randomUin()
    };
    if (body) {
      headers['Content-Length'] = String(Buffer.byteLength(body, 'utf-8'));
    }
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async post(endpoint: string, body: string, timeoutMs: number): Promise<string> {
    const url = `${this.baseUrl}/${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(body),
        body,
        signal: controller.signal
      });
      clearTimeout(timer);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
      return text;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  async getQRCode(): Promise<QRCodeResponse> {
    const url = `${this.baseUrl}/ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`QR fetch failed: ${res.status}`);
    return res.json();
  }

  async getQRCodeStatus(qrcode: string): Promise<QRStatusResponse> {
    const url = `${this.baseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LONG_POLL_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { 'iLink-App-ClientVersion': '1' },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`QR status failed: ${res.status}`);
      return res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') return { status: 'wait' };
      throw err;
    }
  }

  async getUpdates(buf: string): Promise<GetUpdatesResponse> {
    const body = JSON.stringify({
      get_updates_buf: buf,
      base_info: { channel_version: CHANNEL_VERSION }
    });
    try {
      const raw = await this.post('ilink/bot/getupdates', body, LONG_POLL_TIMEOUT_MS);
      return JSON.parse(raw);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { ret: 0, msgs: [], get_updates_buf: buf };
      }
      throw err;
    }
  }

  async sendMessage(params: {
    to_user_id: string;
    text: string;
    context_token: string;
  }): Promise<void> {
    const clientId = `fastgpt:${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const body = JSON.stringify({
      msg: {
        from_user_id: '',
        to_user_id: params.to_user_id,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        item_list: [{ type: 1, text_item: { text: params.text } }],
        context_token: params.context_token
      },
      base_info: { channel_version: CHANNEL_VERSION }
    });
    await this.post('ilink/bot/sendmessage', body, SEND_TIMEOUT_MS);
  }
}
