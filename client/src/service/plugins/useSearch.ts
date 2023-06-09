import axios from 'axios';

{
  /*Bing 搜索*/
}
const BingSearch = async (wait_val: string) => {
  const response = await axios.post('newbing中转服务器', {
    prompt: wait_val
  });
  const result = response.data.result;
  return result;
};

{
  /*google 搜索*/
}
const GoogleSearch = async (wait_val: string) => {
  const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: {
      key: process.env.GOOGLE_KEY,
      q: wait_val,
      cx: process.env.searchEngineId,
      start: 1,
      num: 3,
      dateRestrict: 'm[1]' //搜索结果限定为一个月内
    }
  });
  const results = response.data.items;
  if (results !== null) {
    const result = results.map((item: { snippet: string }) => item.snippet).join('\n');
    return result;
  }
};
export { BingSearch, GoogleSearch };
