import { defineInputSchema } from '@/type';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { delay } from '@/utils/delay';

export const InputType = defineInputSchema(
  z.object({
    query: z.string(),
    url: z.string()
  })
);

export const OutputType = z.object({
  result: z
    .array(
      z.object({
        title: z.string(),
        link: z.string(),
        snippet: z.string()
      })
    )
    .nullable(),
  error: z.any()
});

async function func(
  { url, query }: z.infer<typeof InputType>,
  retry = 3
): Promise<z.infer<typeof OutputType>> {
  try {
    const response = await fetch(`${url}?q=${encodeURIComponent(query)}&language=auto`);
    const html = await response.text();
    const $ = cheerio.load(html, {
      xml: false
    });

    const results: z.infer<typeof OutputType>['result'] = [];

    $('.result').each((_: number, element) => {
      const $element = $(element);
      results.push({
        title: $element.find('h3').text().trim(),
        link: $element.find('a').first().attr('href') || '',
        snippet: $element.find('.content').text().trim()
      });
    });

    if (results.length === 0) {
      return {
        result: null,
        error: {
          message: 'No search results',
          code: 500
        }
      };
    }

    return {
      result: results.slice(0, 10)
    };
  } catch (error) {
    console.log(error);
    if (retry <= 0) {
      console.log('Search XNG error', { error });
      return Promise.reject('Failed to fetch data from Search XNG');
    }

    await delay(Math.random() * 2000);
    return func({ url, query }, retry - 1);
  }
}

export async function tool({
  query,
  url
}: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  return func({ query, url });
}
