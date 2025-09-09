import crypto from 'crypto';

/** The final encrypted package to return */
export const createEncryptedResponse = ({
  content,
  finish,
  nonce,
  token,
  aesKey,
  streamId
}: {
  content: string;
  finish: boolean;
  nonce: string;
  token: string;
  aesKey: string;
  streamId?: string;
}) => {
  const response = createPlaintext(finish, content, streamId);
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const encrypted = getMsgSinJsonStr(response, timeStamp, nonce, token, aesKey);
  return encrypted;
};

/** Construct streaming response data */
export const createPlaintext = (finish: boolean, answer: string, streamId?: string) => ({
  msgtype: 'stream',
  stream: {
    ...(streamId && { id: streamId }),
    finish,
    content: answer
  }
});

/** Encrypt plaintext */
export const getMsgSinJsonStr = (
  sendMsgData: any,
  timeStamp: string,
  nonce: string,
  accessToken: string,
  CallbackEncodingAesKey: string
) => {
  var wxcpt = new WXBizMsgCrypt(accessToken, CallbackEncodingAesKey, '');
  sendMsgData = JSON.stringify(sendMsgData);
  const res = wxcpt.EncryptMsg(sendMsgData, timeStamp, nonce as string);
  return res[1];
};

/** SHA1 signature generation */
class SHA1 {
  getSHA1(token: string, timestamp: string, nonce: string, encrypt: string): [number, string?] {
    try {
      const arr = [token, timestamp, nonce, encrypt].sort();
      const str = arr.join('');
      const sha1 = crypto.createHash('sha1').update(str).digest('hex');
      return [0, sha1];
    } catch {
      return [1, 'wecom error: ErrorCode.ComputeSignatureError'];
    }
  }
}

/** PKCS7 padding/removal */
class PKCS7Encoder {
  static blockSize = 32;

  static encode(text: Buffer): Buffer {
    const amountToPad = PKCS7Encoder.blockSize - (text.length % PKCS7Encoder.blockSize);
    const pad = Buffer.alloc(amountToPad, amountToPad);
    return Buffer.concat([text, pad]);
  }

  static decode(text: Buffer): Buffer {
    let pad = text[text.length - 1];
    if (pad < 1 || pad > PKCS7Encoder.blockSize) {
      pad = 0;
    }
    return text.slice(0, text.length - pad);
  }
}

/** JSON packaging and parsing */
class JsonParse {
  generate(encrypt: string, signature: string, timestamp: string, nonce: string): string {
    return JSON.stringify({
      encrypt,
      msg_signature: signature,
      timeStamp: timestamp,
      nonce
    });
  }

  extract(jsonStr: string): [number, string?] {
    try {
      const json = JSON.parse(jsonStr);
      if (!json.encrypt) {
        return [1, 'wecom error: ErrorCode.ParseXmlError'];
      }
      return [0, json.encrypt];
    } catch {
      return [1, 'wecom error: ErrorCode.ParseXmlError'];
    }
  }
}

/** AES encryption/decryption */
class Prpcrypt {
  key: Buffer;
  iv: Buffer;

  constructor(encodingAesKey: string) {
    this.key = Buffer.from(encodingAesKey + '=', 'base64');
    this.iv = this.key.slice(0, 16);
  }

  encrypt(text: string, receiveId: string): [number, string?] {
    try {
      const random16 = crypto.randomBytes(16);
      const msg = Buffer.from(text);
      const msgLength = Buffer.alloc(4);
      msgLength.writeUInt32BE(msg.length, 0);

      const receiveIdBuf = Buffer.from(receiveId);

      const buf = Buffer.concat([random16, msgLength, msg, receiveIdBuf]);
      const padded = PKCS7Encoder.encode(buf);

      const cipher = crypto.createCipheriv('aes-256-cbc', this.key, this.iv);
      cipher.setAutoPadding(false);
      const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);

      return [0, encrypted.toString('base64')];
    } catch {
      return [1, 'wecom error: ErrorCode.EncryptAESError'];
    }
  }

  decrypt(encrypt: string, receiveId: string): [number, string?] {
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, this.iv);
      decipher.setAutoPadding(false);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypt, 'base64')),
        decipher.final()
      ]);

      const buf = PKCS7Encoder.decode(decrypted);

      const msgLength = buf.readUInt32BE(16);
      const msg = buf.slice(20, 20 + msgLength).toString();
      const fromReceiveId = buf.slice(20 + msgLength).toString();

      if (fromReceiveId !== receiveId) {
        return [1, 'wecom error: ErrorCode.ValidateCorpidError'];
      }

      return [0, msg];
    } catch {
      return [1, 'wecom error: ErrorCode.DecryptAESError'];
    }
  }
}

/** Main class */
export class WXBizMsgCrypt {
  private m_sToken: string;
  private m_sEncodingAesKey: string;
  private m_sReceiveId: string;

  constructor(token: string, encodingAesKey: string, receiveId: string) {
    this.m_sToken = token;
    this.m_sEncodingAesKey = encodingAesKey;
    this.m_sReceiveId = receiveId;
  }

  /** Encrypt message */
  EncryptMsg(sReplyMsg: string, sTimeStamp: string, sNonce: string): [number, string?] {
    const pc = new Prpcrypt(this.m_sEncodingAesKey);
    const [ret, encrypt] = pc.encrypt(sReplyMsg, this.m_sReceiveId);
    if (ret !== 0 || !encrypt) return [ret];

    if (!sTimeStamp) {
      sTimeStamp = String(Math.floor(Date.now() / 1000));
    }

    const sha1 = new SHA1();
    const [sigRet, signature] = sha1.getSHA1(this.m_sToken, sTimeStamp, sNonce, encrypt);
    if (sigRet !== 0) return [sigRet];

    const jsonParse = new JsonParse();
    const sEncryptMsg = jsonParse.generate(encrypt, signature!, sTimeStamp, sNonce);

    return [0, sEncryptMsg];
  }
}
