import { getErrText } from '@fastgpt/global/common/error/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import { delay } from '@fastgpt/global/common/system/utils';
import wiki from 'wikijs';

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
    const searchResults = await wiki({ apiUrl: 'https://zh.wikipedia.org/w/api.php' })
      .page(query)
      .then((page) => {
        return page.summary();
      });

    return {
      result: searchResults
    };
  } catch (error) {
    console.log(error);

    if (retry <= 0) {
      addLog.warn('search wiki error', { error });
      return {
        result: getErrText(error, 'Failed to fetch data from wiki')
      };
    }

    await delay(Math.random() * 5000);
    return main(props, retry - 1);
  }
};

export default main;
