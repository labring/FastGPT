import { defineInputSchema } from '@/type';
import { delay } from '@/utils/delay';
import { getErrText } from '@/utils/err';
import { SafeSearchType, searchImages } from 'duck-duck-scrape';
import { z } from 'zod';

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
    const searchResults = await searchImages(query, {
      safeSearch: SafeSearchType.STRICT
    });

    const result = searchResults.results
      .map((item) => ({
        title: item.title,
        image: item.image
      }))
      .slice(0, 10);

    return {
      result: JSON.stringify(result)
    };
  } catch (error) {
    if (retry <= 0) {
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
