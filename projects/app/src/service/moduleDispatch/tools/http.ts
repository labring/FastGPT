import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@fastgpt/global/core/module/type.d';
import {
  DYNAMIC_INPUT_KEY,
  ModuleInputKeyEnum,
  ModuleOutputKeyEnum
} from '@fastgpt/global/core/module/constants';
import axios from 'axios';
import { valueTypeFormat } from '../utils';
import { SERVICE_LOCAL_HOST } from '@fastgpt/service/common/system/tools';

type HttpRequestProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.abandon_httpUrl]: string;
  [ModuleInputKeyEnum.httpMethod]: string;
  [ModuleInputKeyEnum.httpReqUrl]: string;
  [ModuleInputKeyEnum.httpHeaders]: string;
  [key: string]: any;
}>;
type HttpResponse = {
  [ModuleOutputKeyEnum.failed]?: boolean;
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
  [key: string]: any;
};

const flatDynamicParams = (params: Record<string, any>) => {
  const dynamicParams = params[DYNAMIC_INPUT_KEY];
  if (!dynamicParams) return params;
  return {
    ...params,
    ...dynamicParams,
    [DYNAMIC_INPUT_KEY]: undefined
  };
};

export const dispatchHttpRequest = async (props: HttpRequestProps): Promise<HttpResponse> => {
  let {
    appId,
    chatId,
    responseChatItemId,
    variables,
    outputs,
    params: {
      system_httpMethod: httpMethod = 'POST',
      system_httpReqUrl: httpReqUrl,
      system_httpHeader: httpHeader,
      ...body
    }
  } = props;

  if (!httpReqUrl) {
    return Promise.reject('Http url is empty');
  }

  body = flatDynamicParams(body);

  const requestBody = {
    appId,
    chatId,
    responseChatItemId,
    variables,
    data: body
  };
  const requestQuery = {
    appId,
    chatId,
    ...variables,
    ...body
  };

  const formatBody = transformFlatJson({ ...requestBody });

  // parse header
  const headers = await (() => {
    try {
      if (!httpHeader) return {};
      return JSON.parse(httpHeader);
    } catch (error) {
      return Promise.reject('Header 为非法 JSON 格式');
    }
  })();

  try {
    const response = await fetchData({
      method: httpMethod,
      url: httpReqUrl,
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
