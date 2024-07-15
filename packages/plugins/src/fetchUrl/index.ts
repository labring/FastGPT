import { urlsFetch } from '@fastgpt/service/common/string/cheerio';

type Props = {
  url: string;
};
type Response = Promise<{
  result: any;
}>;

const main = async ({ url }: Props): Response => {
  try {
    const result = await urlsFetch({
      urlList: [url],
      selector: 'body'
    });

    const title = result[0]?.title;
    const content = result[0]?.content;

    return {
      result: `${title ? `# ${title}\n\n` : ''}${content}`
    };
  } catch (error) {
    return {
      result: 'Fetch error'
    };
  }
};

export default main;
