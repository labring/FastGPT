import { UrlFetchParams, UrlFetchResponse } from '@fastgpt/global/common/file/api';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { htmlToMarkdown } from './utils';

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
  const protocol = new URL(fetchUrl).protocol; // http: or https:

  const usedSelector = selector || 'body';
  const selectDom = $(usedSelector);

  // remove i element
  selectDom.find('i,script,style').remove();

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
    if (href) {
      if (href.startsWith('//')) {
        $(el).attr('href', protocol + href);
      } else if (href.startsWith('/')) {
        $(el).attr('href', originUrl + href);
      }
    }
  });
  selectDom.find('img').each((i, el) => {
    const src = $(el).attr('src');
    if (src) {
      if (src.startsWith('//')) {
        $(el).attr('src', protocol + src);
      } else if (src.startsWith('/')) {
        $(el).attr('src', originUrl + src);
      }
    }
  });

  const html = selectDom
    .map((item, dom) => {
      return $(dom).html();
    })
    .get()
    .join('\n');

  const title = $('head title').text() || $('h1:first').text() || fetchUrl;

  return {
    html,
    title,
    usedSelector
  };
};
export const urlsFetch = async ({
  urlList,
  selector
}: UrlFetchParams): Promise<UrlFetchResponse> => {
  urlList = urlList.filter((url) => /^(http|https):\/\/[^ "]+$/.test(url));

  const response = await Promise.all(
    urlList.map(async (url) => {
      try {
        const fetchRes = await axios.get(url, {
          timeout: 30000
        });

        const $ = cheerio.load(fetchRes.data);
        const { title, html, usedSelector } = cheerioToHtml({
          fetchUrl: url,
          $,
          selector
        });

        const md = await htmlToMarkdown(html);

        return {
          url,
          title,
          content: md,
          selector: usedSelector
        };
      } catch (error) {
        console.log(error, 'fetch error');

        return {
          url,
          title: '',
          content: '',
          selector: ''
        };
      }
    })
  );

  return response;
};

export const loadContentByCheerio = async (content: string) => cheerio.load(content);
