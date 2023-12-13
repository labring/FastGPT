import axios from 'axios';
import { UrlFetchParams, UrlFetchResponse } from './api.d';
import { htmlToMarkdown } from '../string/markdown';
import * as cheerio from 'cheerio';

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

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

  // remove i element
  $('i,script').remove();

  // remove empty a element
  $('a')
    .filter((i, el) => {
      return $(el).text().trim() === '' && $(el).children().length === 0;
    })
    .remove();

  // if link,img startWith /, add origin url
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (href && href.startsWith('/')) {
      $(el).attr('href', originUrl + href);
    }
  });
  $('img').each((i, el) => {
    const src = $(el).attr('src');
    if (src && src.startsWith('/')) {
      $(el).attr('src', originUrl + src);
    }
  });

  const html = $(selector || 'body')
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

          const md = htmlToMarkdown(
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
