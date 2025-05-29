import { z } from 'zod';

const bingURL = 'https://api.bing.microsoft.com/v7.0/search';

export const InputType = z.object({
  key: z.string(),
  query: z.string()
});

export const OutputType = z.object({
  result: z.string()
});

export async function tool(props: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  const { key, query } = props;
  const url = new URL(bingURL);
  url.searchParams.set('q', query);
  const response = await fetch(url, {
    headers: {
      'Ocp-Apim-Subscription-Key': key
    }
  });
  const data = await response.json();
  const result = data.webPages.value.map(
    (item: { name: string; url: string; snippet: string }) => ({
      title: item.name,
      link: item.url,
      snippet: item.snippet
    })
  );
  return {
    result: JSON.stringify(result)
  };
}
