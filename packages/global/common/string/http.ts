import parse from '@bany/curl-to-json';

type RequestMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';
const methodMap: { [K in RequestMethod]: string } = {
  get: 'GET',
  post: 'POST',
  put: 'PUT',
  delete: 'DELETE',
  patch: 'PATCH'
};

export const parseCurl = (curlContent: string) => {
  const parsed = parse(curlContent);

  if (!parsed.url) {
    throw new Error('url not found');
  }

  const newParams = Object.keys(parsed.params || {}).map((key) => ({
    key,
    value: parsed.params?.[key],
    type: 'string'
  }));
  const newHeaders = Object.keys(parsed.header || {}).map((key) => ({
    key,
    value: parsed.header?.[key],
    type: 'string'
  }));
  const newBody = JSON.stringify(parsed.data, null, 2);
  const bodyArray = Object.keys(parsed.data || {}).map((key) => ({
    key,
    value: parsed.data?.[key],
    type: 'string'
  }));

  return {
    url: parsed.url,
    method: methodMap[parsed.method?.toLowerCase() as RequestMethod] || 'GET',
    params: newParams,
    headers: newHeaders,
    body: newBody,
    bodyArray
  };
};
