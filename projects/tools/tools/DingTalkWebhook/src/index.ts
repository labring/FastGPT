import { defineInputSchema } from '@/type';
import { z } from 'zod';
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

export const InputType = defineInputSchema(
  z.object({
    钉钉机器人地址: z.string(),
    加签值: z.string(),
    发送的消息: z.string()
  })
);

export const OutputType = z.object({
  钉钉机器人地址: z.string(),
  加签值: z.string(),
  发送的消息: z.string()
});

export async function tool(props: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  const { sign, timestamp } = createHmac('sha256', props.加签值);
  const url = new URL(props.钉钉机器人地址);
  url.searchParams.append('timestamp', timestamp);
  url.searchParams.append('sign', sign);

  await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      msgtype: 'text',
      text: {
        content: props.发送的消息
      }
    })
  });

  return {
    钉钉机器人地址: props.钉钉机器人地址,
    加签值: props.加签值,
    发送的消息: props.发送的消息
  };
}
