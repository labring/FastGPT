# Cloudflare Proxy Configuration

[From the tutorial by "不做了睡觉" (I'm not going to sleep)](https://gravel-twister-d32.notion.site/FastGPT-API-ba7bb261d5fd4fd9bbb2f0607dacdc9e)

**Workers Configuration File**

```js
const TELEGRAPH_URL = 'https://api.openai.com';

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // Security validation
  if (request.headers.get('auth') !== 'auth_code') {
    return new Response('UnAuthorization', { status: 403 });
  }

  const url = new URL(request.url);
  url.host = TELEGRAPH_URL.replace(/^https?:\/\//, '');

  const modifiedRequest = new Request(url.toString(), {
    headers: request.headers,
    method: request.method,
    body: request.body,
    redirect: 'follow'
  });

  const response = await fetch(modifiedRequest);
  const modifiedResponse = new Response(response.body, response);

  // Add response headers to allow cross-origin access
  modifiedResponse.headers.set('Access-Control-Allow-Origin', '*');

  return modifiedResponse;
}
```

**Corresponding Environment Variables**
Make sure not to forget to fill in `v1`

```
OPENAI_BASE_URL=https://xxxxxx/v1
OPENAI_BASE_URL_AUTH=auth_code
```