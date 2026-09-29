import { type UrlFetchParams, type UrlFetchResponse } from '@fastgpt/global/common/file/api';
import * as cheerio from 'cheerio';
import { axios } from '../api/axios';
import { htmlToMarkdown } from './utils';
import { isInternalAddress } from '../system/utils';
import { getLogger, LogCategories } from '../logger';

const logger = getLogger(LogCategories.HTTP.ERROR);

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

  /**
   * 把页面里的相对地址补全为绝对地址。
   * `//`、`/` 开头的沿用原来的拼接方式；`a.png`、`./a.png`、`../a.png` 这类路径相对地址
   * 要相对当前页面解析，否则写进知识库后会被当成相对 FastGPT 自己的地址，图片和链接都会失效。
   * 已带协议（https:、mailto:、data: 等）的地址和页内锚点 `#xxx` 保持不变。
   */
  const toAbsoluteUrl = (value: string) => {
    if (value.startsWith('//')) return protocol + value;
    if (value.startsWith('/')) return originUrl + value;
    if (value.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(value)) return value;
    try {
      return new URL(value, fetchUrl).href;
    } catch {
      return value;
    }
  };

  selectDom.find('a').each((i, el) => {
    const href = $(el).attr('href');
    if (href) {
      $(el).attr('href', toAbsoluteUrl(href));
    }
  });
  selectDom.find('img, video, source, audio, iframe').each((i, el) => {
    const src = $(el).attr('src');
    if (src) {
      $(el).attr('src', toAbsoluteUrl(src));
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
      const isInternal = await isInternalAddress(url);
      if (isInternal) {
        return {
          url,
          title: '',
          content: 'Cannot fetch internal url',
          selector: ''
        };
      }

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
        logger.warn('Failed to fetch url content', { url, error });

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
