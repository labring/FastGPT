import { Cluster } from 'puppeteer-cluster';
import * as cheerio from 'cheerio';
import UserAgent from 'user-agents';
import { setupPage } from './setupPage';
import { getCachedPage, updateCacheAsync } from './cacheUpdater';
import { handleSpecialWebsite } from '../specialHandlers';
import fetch from 'node-fetch';

interface CachedPage {
  url: string;
  content: string;
  hash: string;
  updatedAt: Date;
}

export const performDeepSearch = async (clusterInstance: Cluster, resultUrls: string[], results: Map<string, any>, strategies: any[], detectWebsites: string[], pageCount: number) => {
  const tasks = [];

  await clusterInstance.task(async ({ page, data: { searchUrl } }) => {
    try {
      const cachedPage = await getCachedPage(searchUrl) as CachedPage | null;
      if (cachedPage) {
        const result = results.get(searchUrl);
        if (result) {
          result.content = cachedPage.content;
          result.crawlStatus = 'Success';
        }
        return;
      }
    } catch (error) {
      console.error(`从缓存获取页面 ${searchUrl} 时发生错误:`, error);
      results.set(searchUrl, { url: searchUrl, error: (error as Error).message, crawlStatus: 'Failed' });
      return;
    }

    try {
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': new UserAgent({ deviceCategory: 'desktop', platform: 'Linux x86_64' }).toString(),
          'Referer': 'https://www.google.com/',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        const content = await response.text();
        const $ = cheerio.load(content);
        const cleanedContent = $('body').html() || '';

        const result = results.get(searchUrl);
        if (result) {
          result.content = cleanedContent;
          result.crawlStatus = 'Success';
        }

        await updateCacheAsync(searchUrl, cleanedContent || '');
        return;
      } else {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error(`快速抓取页面 ${searchUrl} 时发生错误:`, error);
    }

    try {
      if (detectWebsites.some(website => searchUrl.includes(website))) {
        await setupPage(page);
      } else {
        const userAgent = new UserAgent({ deviceCategory: 'desktop', platform: 'Linux x86_64' });
        await page.setUserAgent(userAgent.toString());
      }
    } catch (error) {
      console.error(`访问页面 ${searchUrl} 设置用户代理时发生错误:`, error);
    }

    let pageLoaded = false;
    let pageLoadError: Error | null = null;
    for (const strategy of strategies) {
      try {
        await page.goto(searchUrl, { waitUntil: strategy.waitUntil, timeout: strategy.timeout });
        pageLoaded = true;
        break;
      } catch (error: any) {
        if (error.name === 'TimeoutError') {
          pageLoadError = error;
          continue;
        } else {
          pageLoadError = error;
          throw error;
        }
      }
    }
    if (!pageLoaded) {
      const result = results.get(searchUrl);
      if (result) {
        result.error = pageLoadError;
        result.crawlStatus = 'Failed';
      }
      return;
    }

    try {
      let cleanedContent = await handleSpecialWebsite(page, searchUrl);
      if (!cleanedContent) {
        const content = await page.content();
        const $ = cheerio.load(content);
        cleanedContent = $('body').html() || '';
      }

      const result = results.get(searchUrl);
      if (result) {
        result.content = cleanedContent;
        result.crawlStatus = 'Success';
      }

      await updateCacheAsync(searchUrl, cleanedContent || '');
    } catch (error) {
      results.set(searchUrl, { url: searchUrl, error: (error as Error).message, crawlStatus: 'Failed' });
    } finally {
      await page.close().catch(() => {});
    }
  });

  for (const url of resultUrls) {
    if (tasks.length >= pageCount + 10) {
      break;
    }
    tasks.push(clusterInstance.queue({ searchUrl: url }));
  }

  await Promise.all(tasks);

  await clusterInstance.idle();
  await clusterInstance.close();

  return Array.from(results.values()).sort((a, b) => b.score - a.score);
};