import * as crypto from 'crypto';
import * as querystring from 'querystring';

export const createHmac = (algorithm: string, secret: string) => {
  const timestamp = Date.now().toString();
  const stringToSign = `${timestamp}\n${secret}`;

  // 创建 HMAC
  const hmac = crypto.createHmac(algorithm, secret);
  hmac.update(stringToSign, 'utf8');
  const signData = hmac.digest();

  const sign = querystring.escape(Buffer.from(signData).toString('base64'));

  return {
    timestamp,
    sign
  };
};
