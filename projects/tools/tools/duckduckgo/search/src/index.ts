import { search, SafeSearchType } from 'duck-duck-scrape';
import { defineInputSchema } from '@/type';
import { format } from 'date-fns';
import { z } from 'zod';
import { getErrText } from '@/utils/err';
import { delay } from '@/utils/delay';

export const InputType = defineInputSchema(
  z.object({
    query: z.string()
  })
);

export const OutputType = z.object({
  result: z.string()
});

const func = async (query: string, retry = 3) => {
  try {
    const searchResults = await search(query, {
      safeSearch: SafeSearchType.STRICT,
      time: 'y'
    });

    const result = searchResults.results
      .map((item) => ({
        title: item.title,
        link: item.url,
        snippet: item.description
      }))
      .slice(0, 10);

    return {
      result: JSON.stringify(result)
    };
  } catch (error) {
    console.log(error);
    if (retry <= 0) {
      console.log('DuckDuckGo error', { error });
      return {
        result: getErrText(error, 'Failed to fetch data from DuckDuckGo')
      };
    }

    await delay(Math.random() * 5000);
    return func(query, retry - 1);
  }
};

export async function tool(props: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  const { result } = await func(props.query);
  return { result };
}
