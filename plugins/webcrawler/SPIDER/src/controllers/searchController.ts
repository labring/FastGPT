import { Request, Response } from 'express';
import { Cluster } from 'puppeteer-cluster';
import dotenv from 'dotenv';
import { performDeepSearch } from '../utils/deepSearch';
import { fetchSearchResults as fetchBaiduResults } from '../engines/baiduEngine';
import { fetchSearchResults as fetchSearchxngResults } from '../engines/searchxngEngine';

dotenv.config();

const strategies = JSON.parse(process.env.STRATEGIES || '[]');
const detectWebsites = process.env.DETECT_WEBSITES?.split(',') || [];
const maxConcurrency = parseInt(process.env.MAX_CONCURRENCY || '10', 10);

export const search = async (req: Request, res: Response): Promise<void> => {
  const {
    query,
    pageCount = 10,
    needDetails = 'false',
    engine = 'baidu',
    categories = 'general'
  } = req.query;
  const needDetailsBool = needDetails === 'true';

  if (!query) {
    res.status(400).json({
      status: 400,
      error: {
        code: 'MISSING_PARAM',
        message: '缺少必要参数: query'
      }
    });
    return;
  }
  let fetchSearchResults;
  let searchUrlBase;
  try {
    if (engine === 'baidu') {
      fetchSearchResults = fetchBaiduResults;
      searchUrlBase = process.env.ENGINE_BAIDUURL;
    } else if (engine === 'searchxng') {
      fetchSearchResults = fetchSearchxngResults;
      searchUrlBase = process.env.ENGINE_SEARCHXNGURL;
    } else {
      res.status(400).json({
        status: 400,
        error: {
          code: 'INVALID_ENGINE',
          message: '无效的搜索引擎'
        }
      });
      return;
    }

    const { resultUrls, results } = await fetchSearchResults(
      query as string,
      Number(pageCount),
      searchUrlBase || '',
      categories as string
    );

    //如果返回值为空，返回空数组
    if (results.size === 0) {
      console.log('No results found');
      res.status(200).json({
        status: 200,
        data: {
          results: []
        }
      });
      return;
    }

    if (!needDetailsBool) {
      console.log('Need details is false');
      results.forEach((value: any) => {
        if (value.crawlStatus === 'Pending') {
          value.crawlStatus = 'Success';
        }
      });
      res.status(200).json({
        status: 200,
        data: {
          results: Array.from(results.values())
        }
      });
    } else {
      console.log('Need details is true');

      const clusterInstance = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: maxConcurrency,
        puppeteerOptions: {
          ignoreDefaultArgs: ['--enable-automation'],
          headless: 'true',
          executablePath: '/usr/bin/chromium', // 明确指定 Chromium 路径
          pipe: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
          ]
        }
      });

      const sortedResults = await performDeepSearch(
        clusterInstance,
        resultUrls,
        results,
        strategies,
        detectWebsites,
        Number(pageCount)
      );
      res.status(200).json({
        status: 200,
        data: {
          results: sortedResults.slice(0, Number(pageCount))
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 500,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: '发生错误'
      }
    });
  }
};

export default { search };
