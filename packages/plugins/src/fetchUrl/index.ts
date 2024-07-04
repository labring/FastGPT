import { SystemPluginResponseType } from '../../type';
import { urlsFetch } from '../../../service/common/string/cheerio';

type Props = {
  url: string;
};
type Response = Promise<{
  result: any;
}>;

const main = async ({ url }: Props): Response => {
  try {
    console.log(url, '===');
    const result = await urlsFetch({
      urlList: [url],
      selector: 'body'
    });

    return {
      result: {
        title: result[0]?.title || 'none',
        content: result[0]?.content || 'none'
      }
    };
  } catch (error) {
    return {
      result: 'Fetch error'
    };
  }
};

export default main;
