import { defineInputSchema } from '@/type';
import { z } from 'zod';

export const InputType = defineInputSchema(
  z.object({
    content: z.string(),
    hook_url: z.string()
  })
);

export const OutputType = z.object({
  result: z.string()
});

function format(content: string) {
  try {
    const parseData = JSON.parse(content);
    if (typeof parseData === 'object') {
      return parseData;
    }
    return {
      msg_type: 'text',
      content: {
        text: content
      }
    };
  } catch (err) {
    return {
      msg_type: 'text',
      content: {
        text: content
      }
    };
  }
}
export async function tool(props: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  const { content, hook_url } = props;
  const data = format(content);
  const response = await fetch(hook_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return {
    result: String(response)
  };
}
