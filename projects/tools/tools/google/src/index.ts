import { defineInputSchema } from '@/type';
import { z } from 'zod';

export const InputType = defineInputSchema(
  z.object({
    cx: z.string(),
    query: z.string(),
    key: z.string()
  })
);

export const OutputType = z.object({
  result: z.any()
});

export async function tool({
  cx,
  query,
  key
}: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  const url = new URL(`https://www.googleapis.com/customsearch/v1`);
  url.searchParams.append('key', key);
  url.searchParams.append('cx', cx);
  url.searchParams.append('q', query);
  url.searchParams.append('c2coff', '1');
  url.searchParams.append('start', '1');
  url.searchParams.append('end', '20');
  url.searchParams.append('dateRestrict', 'm[1]');

  const response = await fetch(url.toString(), {
    method: 'GET'
  });
  const json = await response.json();
  return {
    result: json
  };
}
