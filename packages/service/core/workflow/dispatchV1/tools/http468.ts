// @ts-nocheck
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import axios from 'axios';
import { DYNAMIC_INPUT_KEY, valueTypeFormat } from '../utils';
import { SERVICE_LOCAL_HOST } from '../../../../common/system/tools';
import { addLog } from '../../../../common/system/log';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getErrText } from '@fastgpt/global/common/error/utils';

type PropsArrType = {
  key: string;
  type: string;
  value: string;
};
type HttpRequestProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.abandon_httpUrl]: string;
  [NodeInputKeyEnum.httpMethod]: string;
  [NodeInputKeyEnum.httpReqUrl]: string;
  [NodeInputKeyEnum.httpHeaders]: PropsArrType[];
  [NodeInputKeyEnum.httpParams]: PropsArrType[];
  [NodeInputKeyEnum.httpJsonBody]: string;
  [DYNAMIC_INPUT_KEY]: Record<string, any>;
  [key: string]: any;
}>;
type HttpResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.failed]?: boolean;
  [key: string]: any;
}>;

const UNDEFINED_SIGN = 'UNDEFINED_SIGN';

export const dispatchHttp468Request = async (props: HttpRequestProps): Promise<HttpResponse> => {
  let {
    appId,
    chatId,
    responseChatItemId,
    variables,
    module: { outputs },
    histories,
    params: {
      system_httpMethod: httpMethod = 'POST',
      system_httpReqUrl: httpReqUrl,
      system_httpHeader: httpHeader,
      system_httpParams: httpParams = [],
      system_httpJsonBody: httpJsonBody,
      [DYNAMIC_INPUT_KEY]: dynamicInput,
      ...body
    }
  } = props;

  if (!httpReqUrl) {
    return Promise.reject('Http url is empty');
  }

  const concatVariables = {
    appId,
    chatId,
    responseChatItemId,
    ...variables,
    histories: histories.slice(-10),
    ...body
  };

  httpReqUrl = replaceVariable(httpReqUrl, concatVariables);
  // parse header
  const headers = await (() => {
    try {
      if (!httpHeader || httpHeader.length === 0) return {};
      // array
      return httpHeader.reduce((acc: Record<string, string>, item) => {
        const key = replaceVariable(item.key, concatVariables);
        const value = replaceVariable(item.value, concatVariables);
        acc[key] = valueTypeFormat(value, 'string');
        return acc;
      }, {});
    } catch (error) {
      return Promise.reject('Header 为非法 JSON 格式');
    }
  })();
  const params = httpParams.reduce((acc: Record<string, string>, item) => {
    const key = replaceVariable(item.key, concatVariables);
    const value = replaceVariable(item.value, concatVariables);
    acc[key] = valueTypeFormat(value, 'string');
    return acc;
  }, {});
  const requestBody = await (() => {
    if (!httpJsonBody) return { [DYNAMIC_INPUT_KEY]: dynamicInput };
    httpJsonBody = replaceVariable(httpJsonBody, concatVariables);
    try {
      const jsonParse = JSON.parse(httpJsonBody);
      const removeSignJson = removeUndefinedSign(jsonParse);
      return { [DYNAMIC_INPUT_KEY]: dynamicInput, ...removeSignJson };
    } catch (error) {
      console.log(error);
      return Promise.reject(`Invalid JSON body: ${httpJsonBody}`);
    }
  })();

  try {
    const { formatResponse, rawResponse } = await fetchData({
      method: httpMethod,
      url: httpReqUrl,
      headers,
      body: requestBody,
      params
    });

    // format output value type
    const results: Record<string, any> = {};
    for (const key in formatResponse) {
      const output = outputs.find((item) => item.key === key);
      if (!output) continue;
      results[key] = valueTypeFormat(formatResponse[key], output.valueType);
    }

    return {
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: 0,
        params: Object.keys(params).length > 0 ? params : undefined,
        body: Object.keys(requestBody).length > 0 ? requestBody : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        httpResult: rawResponse
      },
      [DispatchNodeResponseKeyEnum.toolResponses]: results,
      [NodeOutputKeyEnum.httpRawResponse]: rawResponse,
      ...results
    };
  } catch (error) {
    addLog.error('Http request error', error);
    return {
      [NodeOutputKeyEnum.failed]: true,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: 0,
        params: Object.keys(params).length > 0 ? params : undefined,
        body: Object.keys(requestBody).length > 0 ? requestBody : undefined,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        httpResult: { error: formatHttpError(error) }
      },
      [NodeOutputKeyEnum.httpRawResponse]: getErrText(error)
    };
  }
};

async function fetchData({
  method,
  url,
  headers,
  body,
  params
}: {
  method: string;
  url: string;
  headers: Record<string, any>;
  body: Record<string, any>;
  params: Record<string, any>;
}): Promise<Record<string, any>> {
  const { data: response } = await axios({
    method,
    baseURL: `http://${SERVICE_LOCAL_HOST}`,
    url,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    timeout: 120000,
    params: params,
    data: ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined
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

  return {
    formatResponse:
      typeof response === 'object' && !Array.isArray(response) ? parseJson(response) : {},
    rawResponse: response
  };
}

function replaceVariable(text: string, obj: Record<string, any>) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      text = text.replace(new RegExp(`{{${key}}}`, 'g'), UNDEFINED_SIGN);
    } else {
      const replacement = JSON.stringify(value);
      const unquotedReplacement =
        replacement.startsWith('"') && replacement.endsWith('"')
          ? replacement.slice(1, -1)
          : replacement;
      text = text.replace(new RegExp(`{{${key}}}`, 'g'), unquotedReplacement);
    }
  }
  return text || '';
}
function removeUndefinedSign(obj: Record<string, any>) {
  for (const key in obj) {
    if (obj[key] === UNDEFINED_SIGN) {
      obj[key] = undefined;
    } else if (Array.isArray(obj[key])) {
      obj[key] = obj[key].map((item: any) => {
        if (item === UNDEFINED_SIGN) {
          return undefined;
        } else if (typeof item === 'object') {
          removeUndefinedSign(item);
        }
        return item;
      });
    } else if (typeof obj[key] === 'object') {
      removeUndefinedSign(obj[key]);
    }
  }
  return obj;
}
function formatHttpError(error: any) {
  return {
    message: error?.message,
    name: error?.name,
    method: error?.config?.method,
    baseURL: error?.config?.baseURL,
    url: error?.config?.url,
    code: error?.code,
    status: error?.status
  };
}
