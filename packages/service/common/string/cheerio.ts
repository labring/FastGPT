import { type UrlFetchParams, type UrlFetchResponse } from '@fastgpt/global/common/file/api';
import * as cheerio from 'cheerio';
import { axios } from '../api/axios';
import { htmlToMarkdown } from './utils';
import { isInternalAddress } from '../system/utils';
import { getLogger, LogCategories } from '../logger';

const logger = getLogger(LogCategories.HTTP.ERROR);
import FormData from 'form-data';

/**
 * 将HTML转换为Markdown，优先使用自定义服务（如果配置了的话）
 * 自动降级到默认的htmlToMarkdown
 */
export const convertHtmlToMarkdown = async (html: string): Promise<string> => {
  // 判断是否配置了自定义HTML解析服务
  if (global.systemEnv.customPdfParse?.url) {
    try {
      logger.info('Using custom parse service for HTML');
      const buffer = Buffer.from(html, 'utf-8');
      const data = new FormData();
      data.append('file', buffer, { filename: 'page.html' });

      const { data: response } = await axios.post<{
        pages: number;
        markdown: string;
        error?: Object | string;
      }>(global.systemEnv.customPdfParse.url, data, {
        timeout: (global.systemEnv.customPdfParse.timeout || 10) * 1000 * 60,
        headers: {
          ...data.getHeaders(),
          ...(global.systemEnv.customPdfParse.key
            ? { Authorization: `Bearer ${global.systemEnv.customPdfParse.key}` }
            : {})
        }
      });

      if (response.error) {
        logger.warn('Custom parse service returned error, fallback to htmlToMarkdown', {
          error: response.error
        });
        return await htmlToMarkdown(html);
      }

      logger.info('Custom parse service completed', { mdLength: response.markdown.length });
      return response.markdown;
    } catch (error) {
      logger.error('Custom parse service failed, fallback to htmlToMarkdown', {
        error: error instanceof Error ? error.message : String(error)
      });
      return await htmlToMarkdown(html);
    }
  } else {
    logger.debug('Using default htmlToMarkdown');
    return await htmlToMarkdown(html);
  }
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
  selectDom.find('img, video, source, audio, iframe').each((i, el) => {
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

        // 使用convertHtmlToMarkdown处理HTML，自动选择自定义服务或默认方式
        const md = await convertHtmlToMarkdown(html);

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
