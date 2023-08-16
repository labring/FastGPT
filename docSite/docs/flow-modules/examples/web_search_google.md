# Google Search

![](./imgs/google_search_1.png)
![](./imgs/google_search_2.png)

As shown in the above images, with the help of the HTTP module, you can easily integrate a search engine. Here, we take calling the Google Search API as an example.

## Register Google Search API

[Refer to this article to register the Google Search API](https://zhuanlan.zhihu.com/p/174666017)

## Create a Google Search interface

[Here, we use laf to quickly implement an interface, which can be written and published without deployment. Click to open laf cloud](https://laf.dev/), make sure to open the POST request method.

```ts
import cloud from '@lafjs/cloud';
const googleSearchKey = '';
const googleCxId = '';
const baseurl = 'https://www.googleapis.com/customsearch/v1';
export default async function (ctx: FunctionContext) {
  const { searchKey } = ctx.body;
  if (!searchKey) {
    return {
      prompt: ''
    };
  }
  try {
    const { data } = await cloud.fetch.get(baseurl, {
      params: {
        q: searchKey,
        cx: googleCxId,
        key: googleSearchKey,
        c2coff: 1,
        start: 1,
        num: 5,
        dateRestrict: 'm[1]'
      }
    });
    const result = data.items.map((item) => item.snippet).join('\n');
    return {
      prompt: `Here are the search results from Google: ${result}`,
      searchKey: `\nSearch term: ${searchKey}`
    };
  } catch (err) {
    console.log(err);
    return {
      prompt: ''
    };
  }
}
```

## Workflow

Drag out a FastGPT workflow as shown in the image, where the request URL of the HTTP module is the interface address, and the input and output parameters are as follows:
**Input**

```
searchKey: Search Key Word
```

**Output**

```
prompt: Search Result
```

- The HTTP module will send the searchKey to laf, and laf will perform a Google search based on the received input. It will then return the search results through the prompt parameter.
- After receiving the response, the HTTP module connects to the prompt of the "AI Dialogue" to guide the model in providing an answer.
