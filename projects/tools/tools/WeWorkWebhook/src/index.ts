import { defineInputSchema } from '@/type';
import { format } from 'date-fns';
import { z } from 'zod';

export const InputType = defineInputSchema(
  z.object({
    企微机器人地址: z.string(),
    发送的消息: z.string()
  })
);

export const OutputType = z.object({});

export async function tool({
  企微机器人地址,
  发送的消息
}: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  const url = new URL(企微机器人地址);
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      msgtype: 'text',
      text: {
        content: 发送的消息
      }
    })
  });
  if (res.status !== 200) {
    return {
      error: await res.text()
    };
  }
  return {};
}
