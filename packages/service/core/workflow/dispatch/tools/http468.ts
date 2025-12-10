import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  contentTypeMap,
  ContentTypes,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import axios from 'axios';
import { valueTypeFormat } from '@fastgpt/global/core/workflow/runtime/utils';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import type {
  ModuleDispatchProps,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import {
  formatVariableValByType,
  getReferenceVariableValue,
  replaceEditorVariable
} from '@fastgpt/global/core/workflow/runtime/utils';
import json5 from 'json5';
import { JSONPath } from 'jsonpath-plus';
import { getSecretValue } from '../../../../common/secret/utils';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { addLog } from '../../../../common/system/log';
import { SERVICE_LOCAL_HOST } from '../../../../common/system/tools';
import { formatHttpError } from '../utils';
import { isInternalAddress } from '../../../../common/system/utils';
import { serviceRequestMaxContentLength } from '../../../../common/system/constants';

type PropsArrType = {
  key: string;
  type: string;
  value: string;
};
type HttpRequestProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.abandon_httpUrl]: string;
  [NodeInputKeyEnum.headerSecret]?: StoreSecretValueType;
  [NodeInputKeyEnum.httpMethod]: string;
  [NodeInputKeyEnum.httpReqUrl]: string;
  [NodeInputKeyEnum.httpHeaders]?: PropsArrType[];
  [NodeInputKeyEnum.httpParams]?: PropsArrType[];
  [NodeInputKeyEnum.httpJsonBody]?: string;
  [NodeInputKeyEnum.httpFormBody]?: PropsArrType[];
  [NodeInputKeyEnum.httpContentType]: ContentTypes;
  [NodeInputKeyEnum.addInputParam]: Record<string, any>;
  [NodeInputKeyEnum.httpTimeout]?: number;
  [key: string]: any;
}>;
type HttpResponse = DispatchNodeResultType<
  {
    [key: string]: any;
  },
  {
    [NodeOutputKeyEnum.error]?: string;
  }
>;

const UNDEFINED_SIGN = 'UNDEFINED_SIGN';

export const dispatchHttp468Request = async (props: HttpRequestProps): Promise<HttpResponse> => {
  let {
    runningAppInfo: { id: appId },
    chatId,
    responseChatItemId,
    variables,
    node,
    runtimeNodes,
    histories,
    params: {
      system_httpMethod: httpMethod = 'POST',
      system_httpReqUrl: httpReqUrl,
      system_httpHeader: httpHeader = [],
      system_httpParams: httpParams = [],
      system_httpJsonBody: httpJsonBody = '',
      system_httpFormBody: httpFormBody = [],
      system_httpContentType: httpContentType = ContentTypes.json,
      system_httpTimeout: httpTimeout = 60,
      system_header_secret: headerSecret,
      [NodeInputKeyEnum.addInputParam]: dynamicInput,
      ...body
    }
  } = props;

  if (!httpReqUrl) {
    return Promise.reject('Http url is empty');
  }

  const systemVariables = {
    appId,
    chatId,
    responseChatItemId,
    histories: histories?.slice(-10) || []
  };
  const concatVariables = {
    ...variables,
    ...body,
    ...systemVariables
  };
  const allVariables: Record<string, any> = {
    [NodeInputKeyEnum.addInputParam]: concatVariables,
    ...concatVariables
  };

  // General data for variable substitution（Exclude: json body)
  const replaceStringVariables = (text: string) => {
    return replaceEditorVariable({
      text,
      nodes: runtimeNodes,
      variables: allVariables
    });
  };

  httpReqUrl = replaceStringVariables(httpReqUrl);

  const publicHeaders = await (async () => {
    try {
      const contentType = contentTypeMap[httpContentType];
      if (contentType) {
        httpHeader = [{ key: 'Content-Type', value: contentType, type: 'string' }, ...httpHeader];
      }

      return httpHeader.reduce((acc: Record<string, string>, item) => {
        const key = replaceStringVariables(item.key);
        const value = replaceStringVariables(item.value);
        acc[key] = valueTypeFormat(value, WorkflowIOValueTypeEnum.string);
        return acc;
      }, {});
    } catch (error) {
      return Promise.reject('Header 为非法 JSON 格式');
    }
  })();
  const sensitiveHeaders = getSecretValue({
    storeSecret: headerSecret
  });

  const params = httpParams.reduce((acc: Record<string, string>, item) => {
    const key = replaceStringVariables(item.key);
    const value = replaceStringVariables(item.value);
    acc[key] = valueTypeFormat(value, WorkflowIOValueTypeEnum.string);
    return acc;
  }, {});

  const requestBody = await (() => {
    if (httpContentType === ContentTypes.none) return {};
    try {
      if (httpContentType === ContentTypes.formData) {
        if (!Array.isArray(httpFormBody)) return {};
        httpFormBody = httpFormBody.map((item) => ({
          key: replaceStringVariables(item.key),
          type: item.type,
          value: replaceStringVariables(item.value)
        }));
        const formData = new FormData();
        for (const { key, value } of httpFormBody) {
          formData.append(key, value);
        }
        return formData;
      }
      if (httpContentType === ContentTypes.xWwwFormUrlencoded) {
        if (!Array.isArray(httpFormBody)) return {};
        httpFormBody = httpFormBody.map((item) => ({
          key: replaceStringVariables(item.key),
          type: item.type,
          value: replaceStringVariables(item.value)
        }));
        const urlSearchParams = new URLSearchParams();
        for (const { key, value } of httpFormBody) {
          urlSearchParams.append(key, value);
        }
        return urlSearchParams;
      }
      if (!httpJsonBody) return {};
      if (httpContentType === ContentTypes.json) {
        httpJsonBody = replaceJsonBodyString(
          { text: httpJsonBody },
          { variables, allVariables, runtimeNodes }
        );
        return json5.parse(httpJsonBody);
      }

      // Raw text, xml
      httpJsonBody = replaceStringVariables(httpJsonBody);
      return httpJsonBody.replaceAll(UNDEFINED_SIGN, 'null');
    } catch (error) {
      return Promise.reject(`Invalid JSON body: ${httpJsonBody}`);
    }
  })();

  // Just show
  const formattedRequestBody: Record<string, any> = (() => {
    if (requestBody instanceof FormData || requestBody instanceof URLSearchParams) {
      return Object.fromEntries(requestBody);
    } else if (typeof requestBody === 'string') {
      try {
        return json5.parse(requestBody);
      } catch {
        return { content: requestBody };
      }
    } else if (typeof requestBody === 'object' && requestBody !== null) {
      return requestBody;
    }
    return {};
  })();

  try {
    const { formatResponse, rawResponse } = await (async () => {
      return fetchData({
        method: httpMethod,
        url: httpReqUrl,
        headers: { ...sensitiveHeaders, ...publicHeaders },
        body: requestBody,
        params,
        timeout: httpTimeout
      });
    })();

    // format output value type
    const results: Record<string, any> = {};
    node.outputs
      .filter(
        (item) =>
          item.id !== NodeOutputKeyEnum.error &&
          item.id !== NodeOutputKeyEnum.httpRawResponse &&
          item.id !== NodeOutputKeyEnum.addOutputParam
      )
      .forEach((item) => {
        const key = item.key.startsWith('$') ? item.key : `$.${item.key}`;
        results[item.key] = (() => {
          const result = JSONPath({ path: key, json: formatResponse });

          // 如果结果为空,返回 undefined
          if (!result || result.length === 0) {
            return undefined;
          }

          // 以下情况返回数组:
          // 1. 使用通配符 *
          // 2. 使用数组切片 [start:end]
          // 3. 使用过滤表达式 [?(...)]
          // 4. 使用递归下降 ..
          // 5. 使用多个结果运算符 ,
          const needArrayResult = /[*]|[\[][:?]|\.\.|\,/.test(key);

          return needArrayResult ? result : result[0];
        })();
      });

    return {
      data: {
        [NodeOutputKeyEnum.httpRawResponse]: rawResponse,
        ...results
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: 0,
        params: Object.keys(params).length > 0 ? params : undefined,
        body: Object.keys(formattedRequestBody).length > 0 ? formattedRequestBody : undefined,
        headers: Object.keys(publicHeaders).length > 0 ? publicHeaders : undefined,
        httpResult: rawResponse
      },
      [DispatchNodeResponseKeyEnum.toolResponses]:
        Object.keys(results).length > 0 ? results : rawResponse
    };
  } catch (error) {
    addLog.warn('Http request error', formatHttpError(error));

    // @adapt
    if (node.catchError === undefined) {
      return {
        data: {
          [NodeOutputKeyEnum.error]: getErrText(error)
        },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          params: Object.keys(params).length > 0 ? params : undefined,
          body: Object.keys(formattedRequestBody).length > 0 ? formattedRequestBody : undefined,
          headers: Object.keys(publicHeaders).length > 0 ? publicHeaders : undefined,
          httpResult: { error: formatHttpError(error) }
        }
      };
    }

    return {
      error: {
        [NodeOutputKeyEnum.error]: getErrText(error)
      },
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        params: Object.keys(params).length > 0 ? params : undefined,
        body: Object.keys(formattedRequestBody).length > 0 ? formattedRequestBody : undefined,
        headers: Object.keys(publicHeaders).length > 0 ? publicHeaders : undefined,
        httpResult: { error: formatHttpError(error) }
      }
    };
  }
};

/* Replace the JSON string to reduce parsing errors
  1. Replace undefined values with null
  2. Replace newline strings
*/
export const replaceJsonBodyString = (
  { text, depth = 0 }: { text: string; depth?: number },
  props: {
    variables: Record<string, any>;
    allVariables: Record<string, any>;
    runtimeNodes: RuntimeNodeItemType[];
  }
) => {
  const { variables, allVariables, runtimeNodes } = props;

  const MAX_REPLACEMENT_DEPTH = 10;
  const processedVariables = new Set<string>();

  // Prevent infinite recursion
  if (depth > MAX_REPLACEMENT_DEPTH) {
    return text;
  }

  // Check if the variable is in quotes
  const isVariableInQuotes = (text: string, variable: string) => {
    const index = text.indexOf(variable);
    if (index === -1) return false;

    // 计算变量前面的引号数量
    const textBeforeVar = text.substring(0, index);
    const matches = textBeforeVar.match(/"/g) || [];

    // 如果引号数量为奇数，则变量在引号内
    return matches.length % 2 === 1;
  };

  const valToStr = (val: any, isQuoted = false) => {
    if (val === undefined || val === null) {
      if (isQuoted) return '';
      return 'null';
    }

    if (typeof val === 'object') {
      const jsonStr = JSON.stringify(val);
      if (isQuoted) {
        // Only escape quotes for JSON strings inside quotes (backslashes are already properly escaped by JSON.stringify)
        return jsonStr.replace(/"/g, '\\"');
      }
      return jsonStr;
    }

    if (typeof val === 'string') {
      if (isQuoted) {
        const jsonStr = JSON.stringify(val);
        return jsonStr.slice(1, -1); // 移除首尾的双引号
      }
      try {
        JSON.parse(val);
        return val;
      } catch (error) {
        const str = JSON.stringify(val);
        return str.startsWith('"') && str.endsWith('"') ? str.slice(1, -1) : str;
      }
    }

    return String(val);
  };

  // Check for circular references in variable values
  const hasCircularReference = (value: any, targetKey: string): boolean => {
    if (typeof value !== 'string') return false;

    // Check if the value contains the target variable pattern (direct self-reference)
    const selfRefPattern = new RegExp(
      `\\{\\{${targetKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`,
      'g'
    );
    return selfRefPattern.test(value);
  };

  let result = text;
  let hasReplacements = false;

  // 1. Replace {{$nodeId.id$}} variables
  const regex1 = /\{\{\$([^.]+)\.([^$]+)\$\}\}/g;
  const matches1 = [...result.matchAll(regex1)];

  // Build replacement map first to avoid modifying string during iteration
  const replacements1: Array<{ pattern: string; replacement: string }> = [];

  for (const match of matches1) {
    const nodeId = match[1];
    const id = match[2];
    const fullMatch = match[0];
    const variableKey = `${nodeId}.${id}`;

    // Skip if already processed to avoid immediate circular reference
    if (processedVariables.has(variableKey)) {
      continue;
    }

    // 检查变量是否在引号内
    const isInQuotes = isVariableInQuotes(result, fullMatch);

    const variableVal = (() => {
      if (nodeId === VARIABLE_NODE_ID) {
        return variables[id];
      }
      // Find upstream node input/output
      const node = runtimeNodes.find((node) => node.nodeId === nodeId);
      if (!node) return;

      const output = node.outputs.find((output) => output.id === id);
      if (output) return formatVariableValByType(output.value, output.valueType);

      const input = node.inputs.find((input) => input.key === id);
      if (input)
        return getReferenceVariableValue({ value: input.value, nodes: runtimeNodes, variables });
    })();

    const formatVal = valToStr(variableVal, isInQuotes);
    // Check for direct circular reference
    if (hasCircularReference(String(variableVal), variableKey)) {
      continue;
    }

    const escapedPattern = `\\{\\{\\$(${nodeId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\$\\}\\}`;

    replacements1.push({
      pattern: escapedPattern,
      replacement: formatVal
    });

    processedVariables.add(variableKey);
    hasReplacements = true;
  }
  replacements1.forEach(({ pattern, replacement }) => {
    result = result.replace(new RegExp(pattern, 'g'), replacement);
  });

  // 2. Replace {{key}} variables
  const regex2 = /{{([^}]+)}}/g;
  const matches2 = result.match(regex2) || [];
  const uniqueKeys2 = [...new Set(matches2.map((match) => match.slice(2, -2)))];
  // Build replacement map for simple variables
  const replacements2: Array<{ pattern: string; replacement: string }> = [];
  for (const key of uniqueKeys2) {
    if (processedVariables.has(key)) {
      continue;
    }

    const fullMatch = `{{${key}}}`;
    const variableVal = allVariables[key];

    // Check for direct circular reference
    if (hasCircularReference(variableVal, key)) {
      continue;
    }

    // 检查变量是否在引号内
    const isInQuotes = isVariableInQuotes(result, fullMatch);
    const formatVal = valToStr(variableVal, isInQuotes);
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    replacements2.push({
      pattern: `{{(${escapedKey})}}`,
      replacement: formatVal
    });

    processedVariables.add(key);
    hasReplacements = true;
  }
  replacements2.forEach(({ pattern, replacement }) => {
    result = result.replace(new RegExp(pattern, 'g'), replacement);
  });

  // If we made replacements and there might be nested variables, recursively process
  if (hasReplacements && /\{\{[^}]*\}\}/.test(result)) {
    result = replaceJsonBodyString({ text: result, depth: depth + 1 }, props);
  }

  return result.replace(/(".*?")\s*:\s*undefined\b/g, '$1:null');
};

async function fetchData({
  method,
  url,
  headers,
  body,
  params,
  timeout
}: {
  method: string;
  url: string;
  headers: Record<string, any>;
  body: Record<string, any> | string;
  params: Record<string, any>;
  timeout: number;
}) {
  if (isInternalAddress(url)) {
    return Promise.reject('Url is invalid');
  }

  const { data: response } = await axios({
    method,
    maxContentLength: serviceRequestMaxContentLength,
    baseURL: `http://${SERVICE_LOCAL_HOST}`,
    url,
    headers: {
      ...headers
    },
    timeout: timeout * 1000,
    params: params,
    data: ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined
  });

  return {
    formatResponse: typeof response === 'object' ? response : {},
    rawResponse: response
  };
}
