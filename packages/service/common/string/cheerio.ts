import { UrlFetchParams, UrlFetchResponse } from '@fastgpt/global/common/file/api';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { htmlToMarkdown } from './markdown';

export const cheerioToHtml = ({
  fetchUrl,
  $,
  selector
}: {
  fetchUrl: string;
  $: cheerio.CheerioAPI;
  selector?: string;
}) => {
  // get origin url
  const originUrl = new URL(fetchUrl).origin;

  const selectDom = $(selector || 'body');

  // remove i element
  selectDom.find('i,script').remove();

  // remove empty a element
  selectDom
    .find('a')
    .filter((i, el) => {
      return $(el).text().trim() === '' && $(el).children().length === 0;
    })
    .remove();

  // if link,img startWith /, add origin url
  selectDom.find('a').each((i, el) => {
    const href = $(el).attr('href');
    if (href && href.startsWith('/')) {
      $(el).attr('href', originUrl + href);
    }
  });
  selectDom.find('img').each((i, el) => {
    const src = $(el).attr('src');
    if (src && src.startsWith('/')) {
      $(el).attr('src', originUrl + src);
    }
  });

  const html = selectDom
    .map((item, dom) => {
      return $(dom).html();
    })
    .get()
    .join('\n');

  return html;
};
export const urlsFetch = async ({
  urlList,
  selector
}: UrlFetchParams): Promise<UrlFetchResponse> => {
  urlList = urlList.filter((url) => /^(http|https):\/\/[^ "]+$/.test(url));

  const response = (
    await Promise.all(
      urlList.map(async (url) => {
        try {
          const fetchRes = await axios.get(url, {
            timeout: 30000
          });

          const $ = cheerio.load(fetchRes.data);

          const md = await htmlToMarkdown(
            cheerioToHtml({
              fetchUrl: url,
              $,
              selector
            })
          );

          return {
            url,
            content: md
          };
        } catch (error) {
          console.log(error, 'fetch error');

          return {
            url,
            content: ''
          };
        }
      })
    )
  ).filter((item) => item.content);

  return response;
};
