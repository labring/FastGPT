import { search, SafeSearchType } from 'duck-duck-scrape';
import { delay } from '@fastgpt/global/common/system/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import { getErrText } from '@fastgpt/global/common/error/utils';

type Props = {
  query: string;
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: string;
}>;

const main = async (props: Props, retry = 3): Response => {
  const { query } = props;
  try {
    const searchResults = await search(query, {
      safeSearch: SafeSearchType.STRICT,
      time: 'y'
    });

    const result = searchResults.results
      .map((item) => ({
        title: item.title,
        link: item.url,
        snippet: item.description
      }))
      .slice(0, 10);

    return {
      result: JSON.stringify(result)
    };
  } catch (error) {
    console.log(error);
    if (retry <= 0) {
      addLog.warn('DuckDuckGo error', { error });
      return {
        result: getErrText(error, 'Failed to fetch data from DuckDuckGo')
      };
    }

    await delay(Math.random() * 5000);
    return main(props, retry - 1);
  }
};

export default main;
