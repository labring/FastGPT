import axios from 'axios';
import { URL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const blacklistDomains = process.env.BLACKLIST ? JSON.parse(process.env.BLACKLIST) : [];

export const fetchSearchResults = async (
  query: string,
  pageCount: number,
  searchUrlBase: string,
  categories: string
) => {
  const MAX_PAGES = (pageCount / 10 + 1) * 2 + 1; // 最多搜索的页面数
  //如果searchUrlBase为空，返回空数组，pagecount是需要搜索结果的数量
  if (!searchUrlBase) {
    return { resultUrls: [], results: new Map() };
  }
  const resultUrls: string[] = [];
  const results = new Map<string, any>();

  let fetchedResultsCount = 0;
  let pageIndex = 0;

  while (fetchedResultsCount < pageCount && pageIndex < MAX_PAGES) {
    const searchUrl = new URL(
      `${searchUrlBase}?q=${encodeURIComponent(query)}&pageno=${pageIndex + 1}&format=json&categories=${categories}`
    );
    console.log(`Fetching page ${pageIndex + 1} from SearchXNG: ${searchUrl.toString()}`);
    const response = await axios.get(searchUrl.toString());
    const jsonResults = response.data.results;

    for (let index = 0; index < jsonResults.length; index++) {
      const result = jsonResults[index];
      const resultDomain = new URL(result.url).hostname;
      if (
        blacklistDomains.some((domain: string) => resultDomain.endsWith(domain)) ||
        resultDomain.includes('zhihu')
      ) {
        continue;
      }
      resultUrls.push(result.url);
      results.set(result.url, {
        title: result.title,
        url: result.url,
        snippet: result.content,
        source: result.engine,
        crawlStatus: 'Pending',
        score: result.score
      });
      fetchedResultsCount++;
      if (fetchedResultsCount >= pageCount) {
        break;
      }
    }
    pageIndex++;
    if (jsonResults.length === 0) {
      break; // 如果没有更多结果，退出循环
    }
  }

  return { resultUrls, results };
};
