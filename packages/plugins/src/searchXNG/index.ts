import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import { getErrText } from '@fastgpt/global/common/error/utils';
import * as cheerio from 'cheerio';

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
}>;

const main = async (props: Props, retry = 3): Response => {
  const { query, url } = props;

  if (!query) {
    return {
      result: JSON.stringify({
        error: '缺少查询参数'
      })
    };
  }

  if (!url) {
    return {
      result: JSON.stringify({
        error: '缺少url'
      })
    };
  }

  try {
    const response = await fetch(`${url}?q=${encodeURIComponent(query)}`);
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

    return {
      result: JSON.stringify(results.slice(0, 10))
    };
  } catch (error) {
    console.log(error);
    if (retry <= 0) {
      addLog.warn('Search XNG error', { error });
      return {
        result: JSON.stringify({
          error: getErrText(error, 'Failed to fetch data from Search XNG')
        })
      };
    }

    await delay(Math.random() * 5000);
    return main(props, retry - 1);
  }
};

export default main;
