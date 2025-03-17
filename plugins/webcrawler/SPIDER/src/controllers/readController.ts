import { Request, Response } from 'express';
import puppeteer, { Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import UserAgent from 'user-agents';
import { setupPage } from '../utils/setupPage'; // 导入 setupPage 模块
import dotenv from 'dotenv'; // 导入 dotenv 模块
import { URL } from 'url'; // 导入 URL 模块
import { handleSpecialWebsite } from '../specialHandlers'; // 导入 handleSpecialWebsite 模块
import fetch from 'node-fetch';
import { getCachedPage, updateCacheAsync } from '../utils/cacheUpdater'; // 导入缓存相关模块

dotenv.config(); // 加载环境变量

const detectWebsites = process.env.DETECT_WEBSITES?.split(',') || [];
const blacklistDomains = process.env.BLACKLIST ? JSON.parse(process.env.BLACKLIST) : [];

export const readPage = async (req: Request, res: Response): Promise<void> => {
  const { queryUrl } = req.query;
  console.log('-------');
  console.log(queryUrl);
  console.log('-------');

  if (!queryUrl) {
    res.status(400).json({
      status: 400,
      error: {
        code: 'MISSING_PARAM',
        message: '缺少必要参数: queryUrl'
      }
    });
    return;
  }

  const urlDomain = new URL(queryUrl as string).hostname;
  if (blacklistDomains.some((domain: string) => urlDomain.endsWith(domain))) {
    res.status(403).json({
      status: 403,
      error: {
        code: 'BLACKLISTED_DOMAIN',
        message: '该域名受到保护中'
      }
    });
    return;
  }

  try {
    const response = await fetch(queryUrl as string, {
      headers: {
        'User-Agent': new UserAgent({
          deviceCategory: 'desktop',
          platform: 'Linux x86_64'
        }).toString(),
        Referer: 'https://www.google.com/',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache'
      }
    });

    if (response.ok) {
      const content = await response.text();
      const $ = cheerio.load(content);
      const cleanedContent = $('body').html();

      res.status(200).json({
        status: 200,
        data: {
          title: $('title').text(),
          content: cleanedContent
        }
      });

      await updateCacheAsync(queryUrl as string, cleanedContent || '');
      console.log('Page read successfully');
      return;
    } else {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('快速抓取页面时发生错误:', error);
  }

  try {
    const browser = await puppeteer.launch({
      ignoreDefaultArgs: ['--enable-automation'],
      headless: true,
      executablePath: '/usr/bin/chromium', // 明确指定 Chromium 路径
      pipe: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
        // '--single-process'
      ]
    });
    const page = await browser.newPage();

    // 检测是否需要特殊处理
    if (
      typeof queryUrl === 'string' &&
      detectWebsites.some((website) => queryUrl.includes(website))
    ) {
      await setupPage(page);
    } else {
      const userAgent = new UserAgent({ deviceCategory: 'desktop', platform: 'Linux x86_64' });
      await page.setUserAgent(userAgent.toString());
    }

    const queryUrlSafe = new URL(queryUrl as string).toString();

    await page.goto(queryUrlSafe, { waitUntil: 'load' });
    await page.waitForSelector('body');

    const title = await page.title();
    let cleanedContent = await handleSpecialWebsite(page, queryUrl as string);

    if (!cleanedContent) {
      const content = await page.content();
      const $ = cheerio.load(content);
      cleanedContent = $('body').html();
    }

    await page.close();
    await browser.close();

    res.status(200).json({
      status: 200,
      data: {
        title,
        content: cleanedContent
      }
    });

    await updateCacheAsync(queryUrl as string, cleanedContent || '');
    console.log('Page read successfully');
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: 500,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: '读取页面时发生内部服务器错误'
      }
    });
  }
};
