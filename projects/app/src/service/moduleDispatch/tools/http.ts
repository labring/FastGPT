import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';
import axios from 'axios';
import { flatDynamicParams, valueTypeFormat } from '../utils';
import { SERVICE_LOCAL_HOST } from '@fastgpt/service/common/system/tools';

export type HttpRequestProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.abandon_httpUrl]: string;
  [ModuleInputKeyEnum.httpMethod]: string;
  [ModuleInputKeyEnum.httpReqUrl]: string;
  [ModuleInputKeyEnum.httpHeader]: string;
  [key: string]: any;
}>;
export type HttpResponse = {
  [ModuleOutputKeyEnum.failed]?: boolean;
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
  [key: string]: any;
};

export const dispatchHttpRequest = async (props: HttpRequestProps): Promise<HttpResponse> => {
  let {
    appId,
    chatId,
    responseChatItemId,
    variables,
    outputs,
    params: {
      system_httpMethod: httpMethod,
      url: abandonUrl,
      system_httpReqUrl: httpReqUrl,
      system_httpHeader: httpHeader,
      ...body
    }
  } = props;

  body = flatDynamicParams(body);

  const { requestMethod, requestUrl, requestHeader, requestBody, requestQuery } = await (() => {
    // 2024-2-12 clear
    if (abandonUrl) {
      return {
        requestMethod: 'POST',
        requestUrl: abandonUrl,
        requestHeader: httpHeader,
        requestBody: {
          ...body,
          appId,
          chatId,
          variables
        },
        requestQuery: {}
      };
    }
    if (httpReqUrl) {
      return {
        requestMethod: httpMethod,
        requestUrl: httpReqUrl,
        requestHeader: httpHeader,
        requestBody: {
          appId,
          chatId,
          responseChatItemId,
          variables,
          data: body
        },
        requestQuery: {
          appId,
          chatId,
          ...variables,
          ...body
        }
      };
    }

    return Promise.reject('url is empty');
  })();

  const formatBody = transformFlatJson({ ...requestBody });

  // parse header
  const headers = await (() => {
    try {
      if (!requestHeader) return {};
      return JSON.parse(requestHeader);
    } catch (error) {
      return Promise.reject('Header 为非法 JSON 格式');
    }
  })();

  try {
    const response = await fetchData({
      method: requestMethod,
      url: requestUrl,
      headers,
      body: formatBody,
      query: requestQuery
    });

    // format output value type
    const results: Record<string, any> = {};
    for (const key in response) {
      const output = outputs.find((item) => item.key === key);
      if (!output) continue;
      results[key] = valueTypeFormat(response[key], output.valueType);
    }

    return {
      responseData: {
        price: 0,
        body: formatBody,
        httpResult: response
      },
      ...results
    };
  } catch (error) {
    console.log(error);

    return {
      [ModuleOutputKeyEnum.failed]: true,
      responseData: {
        price: 0,
        body: formatBody,
        httpResult: { error }
      }
    };
  }
};

async function fetchData({
  method,
  url,
  headers,
  body,
  query
}: {
  method: string;
  url: string;
  headers: Record<string, any>;
  body: Record<string, any>;
  query: Record<string, any>;
}): Promise<Record<string, any>> {
  const { data: response } = await axios<Record<string, any>>({
    method,
    baseURL: `http://${SERVICE_LOCAL_HOST}`,
    url,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    params: method === 'GET' ? query : {},
    data: method === 'POST' ? body : {}
  });

  /*
    parse the json:
    {
      user: {
        name: 'xxx',
        age: 12
      },
      list: [
        {
          name: 'xxx',
          age: 50
        },
        [{ test: 22 }]
      ],
      psw: 'xxx'
    }

    result: {
      'user': { name: 'xxx', age: 12 },
      'user.name': 'xxx',
      'user.age': 12,
      'list': [ { name: 'xxx', age: 50 }, [ [Object] ] ],
      'list[0]': { name: 'xxx', age: 50 },
      'list[0].name': 'xxx',
      'list[0].age': 50,
      'list[1]': [ { test: 22 } ],
      'list[1][0]': { test: 22 },
      'list[1][0].test': 22,
      'psw': 'xxx'
    }
  */
  const parseJson = (obj: Record<string, any>, prefix = '') => {
    let result: Record<string, any> = {};

    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        result[`${prefix}[${i}]`] = obj[i];

        if (Array.isArray(obj[i])) {
          result = {
            ...result,
            ...parseJson(obj[i], `${prefix}[${i}]`)
          };
        } else if (typeof obj[i] === 'object') {
          result = {
            ...result,
            ...parseJson(obj[i], `${prefix}[${i}].`)
          };
        }
      }
    } else if (typeof obj == 'object') {
      for (const key in obj) {
        result[`${prefix}${key}`] = obj[key];

        if (Array.isArray(obj[key])) {
          result = {
            ...result,
            ...parseJson(obj[key], `${prefix}${key}`)
          };
        } else if (typeof obj[key] === 'object') {
          result = {
            ...result,
            ...parseJson(obj[key], `${prefix}${key}.`)
          };
        }
      }
    }

    return result;
  };

  return parseJson(response);
}

function transformFlatJson(obj: Record<string, any>) {
  for (let key in obj) {
    if (typeof obj[key] === 'object') {
      transformFlatJson(obj[key]);
    }
    if (key.includes('.')) {
      let parts = key.split('.');
      if (parts.length <= 1) continue;

      const firstKey = parts.shift();

      if (!firstKey) continue;

      const lastKey = parts.join('.');

      if (obj[firstKey]) {
        obj[firstKey] = {
          ...obj[firstKey],
          [lastKey]: obj[key]
        };
      } else {
        obj[firstKey] = { [lastKey]: obj[key] };
      }

      transformFlatJson(obj[firstKey]);

      delete obj[key];
    }
  }
  return obj;
}
