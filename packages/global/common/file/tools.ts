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

export const cheerioToHtml = ($: cheerio.CheerioAPI, selector?: string) => {
  // remove i element
  $('i').remove();
  // remove empty a element
  $('a')
    .filter((i, el) => {
      return $(el).text().trim() === '' && $(el).children().length === 0;
    })
    .remove();

  return $(selector || 'body').html();
};
export const urlsFetch = async ({
  urlList,
  selector
}: UrlFetchParams): Promise<UrlFetchResponse> => {
  urlList = urlList.filter((url) => /^(http|https):\/\/[^ "]+$/.test(url));

  const response = (
    await Promise.allSettled(
      urlList.map(async (url) => {
        try {
          const fetchRes = await axios.get(url, {
            timeout: 30000
          });

          const $ = cheerio.load(fetchRes.data);

          const md = htmlToMarkdown(cheerioToHtml($, selector));

          return {
            url,
            content: md
          };
        } catch (error) {
          return {
            url,
            content: ''
          };
        }
      })
    )
  )
    .filter((item) => item.status === 'fulfilled')
    .map((item: any) => item.value)
    .filter((item) => item.content);

  return response;
};
