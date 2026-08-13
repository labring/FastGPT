import crypto from 'crypto';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const CHANNEL_VERSION = '1.0.0';
const ILINK_APP_ID = 'bot';
const ILINK_APP_CLIENT_VERSION = String(1 << 16);
const BOT_TYPE = '3';
const LONG_POLL_TIMEOUT_MS = 35_000;
const SEND_TIMEOUT_MS = 15_000;

export const WechatMessageType = {
  USER: 1,
  BOT: 2
} as const;

export const WechatMessageItemType = {
  NONE: 0,
  TEXT: 1,
  IMAGE: 2,
  VOICE: 3,
  FILE: 4,
  VIDEO: 5
} as const;

export const WechatMessageState = {
  NEW: 0,
  GENERATING: 1,
  FINISH: 2
} as const;

const formatFetchError = (err: unknown) => {
  if (!(err instanceof Error)) return String(err);

  const cause = err.cause as
    | {
        code?: string;
        message?: string;
        name?: string;
      }
    | undefined;

  return [
    `${err.name}: ${err.message}`,
    cause?.code ? `causeCode=${cause.code}` : '',
    cause?.name ? `causeName=${cause.name}` : '',
    cause?.message ? `causeMessage=${cause.message}` : ''
  ]
    .filter(Boolean)
    .join('; ');
};

export type WeixinMessage = {
  /** WeChat message IDs are uint64 and must remain strings after parsing. */
  message_id?: string;
  from_user_id?: string;
  to_user_id?: string;
  message_type?: number;
  message_state?: number;
  item_list?: MessageItem[];
  context_token?: string;
  create_time_ms?: number;
};

export type CDNMedia = {
  encrypt_query_param?: string;
  aes_key?: string;
  encrypt_type?: number;
  full_url?: string;
};

export type ImageItem = {
  media?: CDNMedia;
  thumb_media?: CDNMedia;
  aeskey?: string;
  url?: string;
};

export type FileItem = {
  media?: CDNMedia;
  file_name?: string;
  md5?: string;
  len?: string;
};

export type VideoItem = {
  media?: CDNMedia;
  file_name?: string;
};

export type RefMessage = {
  title?: string;
  message_item?: MessageItem;
};

export type MessageItem = {
  type?: number;
  msg_id?: string;
  text_item?: { text?: string };
  voice_item?: { text?: string; media?: CDNMedia };
  image_item?: ImageItem;
  file_item?: FileItem;
  video_item?: VideoItem;
  ref_msg?: RefMessage;
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
  status:
    | 'wait'
    | 'scaned'
    | 'confirmed'
    | 'expired'
    | 'scaned_but_redirect'
    | 'need_verifycode'
    | 'verify_code_blocked'
    | 'binded_redirect';
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

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': this.randomUin(),
      ...this.buildCommonHeaders()
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  private buildCommonHeaders(): Record<string, string> {
    return {
      'iLink-App-Id': ILINK_APP_ID,
      'iLink-App-ClientVersion': ILINK_APP_CLIENT_VERSION
    };
  }

  private async post(endpoint: string, body: string, timeoutMs: number): Promise<string> {
    const url = `${this.baseUrl}/${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body,
        signal: controller.signal
      });
      clearTimeout(timer);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
      return text;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') throw err;
      throw new Error(`iLink POST ${endpoint} failed: ${formatFetchError(err)}`);
    }
  }

  async getQRCode(): Promise<QRCodeResponse> {
    const raw = await this.post(
      `ilink/bot/get_bot_qrcode?bot_type=${BOT_TYPE}`,
      JSON.stringify({ local_token_list: [] }),
      SEND_TIMEOUT_MS
    );
    return JSON.parse(raw);
  }

  async getQRCodeStatus(qrcode: string): Promise<QRStatusResponse> {
    const url = `${this.baseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LONG_POLL_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: this.buildCommonHeaders(),
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
      // ! JSON.parse reviver context.source requires Node.js >=22.
      return (
        JSON.parse as (
          text: string,
          reviver: (key: string, value: unknown, context: { source: string }) => unknown
        ) => GetUpdatesResponse
      )(raw, (key, value, context) => {
        if (key !== 'message_id' || typeof value !== 'number') return value;
        return context.source;
      });
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
        message_type: WechatMessageType.BOT,
        message_state: WechatMessageState.FINISH,
        item_list: [{ type: WechatMessageItemType.TEXT, text_item: { text: params.text } }],
        context_token: params.context_token
      },
      base_info: { channel_version: CHANNEL_VERSION }
    });
    const raw = await this.post('ilink/bot/sendmessage', body, SEND_TIMEOUT_MS);
    const resp = JSON.parse(raw) as Pick<GetUpdatesResponse, 'ret' | 'errmsg'>;
    if (resp.ret && resp.ret !== 0) {
      throw new Error(`sendMessage ret=${resp.ret} errmsg=${resp.errmsg ?? '(none)'}`);
    }
  }
}
