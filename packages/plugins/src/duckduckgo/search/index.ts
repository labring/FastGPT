import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { search, SafeSearchType } from 'duck-duck-scrape';

type Props = {
  query: string;
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: string;
}>;

const main = async ({ query }: Props): Response => {
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
  // console.log(result);
  return {
    result: JSON.stringify(result)
  };
};

export default main;
