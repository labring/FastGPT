import { delay } from '@fastgpt/global/common/system/utils';
import * as cheerio from 'cheerio';
import { i18nT } from '../../../web/i18n/utils';

type Props = {
  query: string;
  url: string;
};

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

type Response = Promise<{
  result: string;
  error?: Record<string, any>;
}>;

const main = async (props: Props, retry = 3): Response => {
  const { query, url } = props;

  if (!query) {
    return Promise.reject(i18nT('chat:not_query'));
  }

  if (!url) {
    return Promise.reject('Can not find url');
  }

  try {
    const response = await fetch(`${url}?q=${encodeURIComponent(query)}&language=auto`);
    const html = await response.text();
    const $ = cheerio.load(html, {
      xml: false,
      decodeEntities: true
    });

    const results: SearchResult[] = [];

    $('.result').each((_: number, element: cheerio.Element) => {
      const $element = $(element);
      results.push({
        title: $element.find('h3').text().trim(),
        link: $element.find('a').first().attr('href') || '',
        snippet: $element.find('.content').text().trim()
      });
    });

    if (results.length === 0) {
      return {
        result: JSON.stringify([]),
        error: {
          message: 'No search results',
          code: 500
        }
      };
    }

    return {
      result: JSON.stringify(results.slice(0, 10))
    };
  } catch (error) {
    console.log(error);
    if (retry <= 0) {
      console.log('Search XNG error', { error });
      return Promise.reject('Failed to fetch data from Search XNG');
    }

    await delay(Math.random() * 2000);
    return main(props, retry - 1);
  }
};

export default main;
