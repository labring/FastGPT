import type { moduleDispatchResType } from '@fastgpt/global/core/chat/type.d';
import type { ModuleDispatchProps } from '@/types/core/chat/type';
import { ModuleInputKeyEnum, ModuleOutputKeyEnum } from '@fastgpt/global/core/module/constants';

export type HttpRequestProps = ModuleDispatchProps<{
  [ModuleInputKeyEnum.abandon_httpUrl]: string;
  [ModuleInputKeyEnum.httpReqUrl]: string;
  [ModuleInputKeyEnum.httpReqAuth]: string;
  [key: string]: any;
}>;
export type HttpResponse = {
  [ModuleOutputKeyEnum.failed]?: boolean;
  [ModuleOutputKeyEnum.responseData]: moduleDispatchResType;
  [key: string]: any;
};

export const dispatchHttpRequest = async (props: HttpRequestProps): Promise<HttpResponse> => {
  const {
    appId,
    chatId,
    variables,
    inputs: { url: abandonUrl, httpReqUrl, httpReqAuth, ...body }
  } = props;

  const { requestUrl, requestBody } = await (() => {
    // 2024-2-12 clear
    if (abandonUrl)
      return {
        requestUrl: abandonUrl,
        requestBody: {
          ...body,
          appId,
          chatId,
          variables
        }
      };
    if (httpReqUrl)
      return {
        requestUrl: httpReqUrl,
        requestBody: {
          appId,
          chatId,
          variables,
          data: body
        }
      };
    return Promise.reject('url is empty');
  })();

  const formatBody = transformFlatJson({ ...requestBody });

  try {
    const response = await fetchData({
      url: requestUrl,
      auth: httpReqAuth,
      body: formatBody
    });

    return {
      responseData: {
        price: 0,
        body: formatBody,
        httpResult: response
      },
      ...response
    };
  } catch (error) {
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
  url,
  auth,
  body
}: {
  url: string;
  auth: string;
  body: Record<string, any>;
}): Promise<Record<string, any>> {
  const response: Record<string, any> = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth
    },
    body: JSON.stringify(body)
  }).then((res) => res.json());

  /* 
    parse the json:
    {
      user: {
        name: 'xxx',
        age: 12
      }
      psw: 'xxx'
    }

    result: {
      'user': {
        name: 'xxx',
        age: 12
      },
      'user.name': 'xxx',
      'user.age': 12,
      'psw': 'xxx'
    }
  */
  const parseJson = (obj: Record<string, any>, prefix = '') => {
    let result: Record<string, any> = {};
    for (const key in obj) {
      if (typeof obj[key] === 'object') {
        result[key] = obj[key];
        result = {
          ...result,
          ...parseJson(obj[key], `${prefix}${key}.`)
        };
      } else {
        result[`${prefix}${key}`] = obj[key];
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
