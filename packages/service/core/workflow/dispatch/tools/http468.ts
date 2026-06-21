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
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import type {
  ModuleDispatchProps,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import {
  formatVariableValByType,
  getReferenceVariableValue,
  valueTypeFormat
} from '@fastgpt/global/core/workflow/runtime/utils';
import type { AxiosRequestConfig } from 'axios';
import json5 from 'json5';
import { JSONPath } from 'jsonpath-plus';
import { getSecretValue } from '../../../../common/secret/utils';
import type { StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getLogger, LogCategories } from '../../../../common/logger';
import { formatHttpError, getNodeErrResponse } from '../utils';
import { isInternalAddress, PRIVATE_URL_TEXT } from '../../../../common/system/utils';
import { serviceRequestMaxContentLength } from '../../../../common/system/constants';
import { axios, httpsCertificateIgnoreAgent } from '../../../../common/api/axios';
import { replaceEditorVariable } from '../utils/replaceEditorVariable';
import { checkStrOversize, logOversizeString } from '../../../../common/string/replaceVariable';

const logger = getLogger(LogCategories.MODULE.WORKFLOW.TOOLS);

/**
 * 仅工作流 HTTP 节点允许按系统配置跳过 HTTPS 证书校验。
 * 该配置不下沉到通用 axios,避免影响模型请求、HTTP 工具集等其它出站链路。
 */
export const getWorkflowHttpNodeHttpsAgentConfig = (
  url: string
): Pick<AxiosRequestConfig, 'httpsAgent'> => {
  const ignoreHttpsCertificate =
    global.systemEnv?.workflowHttpNode?.ignoreHttpsCertificate === true;

  if (!ignoreHttpsCertificate) {
    return {};
  }

  try {
    if (new URL(url).protocol !== 'https:') {
      return {};
    }
  } catch {
    return {};
  }

  return {
    httpsAgent: httpsCertificateIgnoreAgent
  };
};

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
    [NodeOutputKeyEnum.errorText]: string; //未使用，仅作类型。
    [NodeOutputKeyEnum.error]: string; // 适配字段
    [NodeOutputKeyEnum.httpRawError]?: ReturnType<typeof formatHttpError>;
  }
>;

const UNDEFINED_SIGN = 'UNDEFINED_SIGN';

export const dispatchHttp468Request = async (props: HttpRequestProps): Promise<HttpResponse> => {
  const {
    runningAppInfo: { id: appId },
    chatId,
    responseChatItemId,
    variableState,
    node,
    runtimeNodesMap,
    histories,
    params: {
      system_httpReqUrl: httpReqUrl,
      system_httpHeader: httpHeader = [],
      system_httpParams: httpParams = [],
      system_httpJsonBody: httpJsonBody = '',
      system_httpFormBody: httpFormBody = [],
      ...body
    }
  } = props;
  const httpMethod = props.params.system_httpMethod || 'POST';
  const httpContentType = props.params.system_httpContentType || ContentTypes.json;
  const httpTimeout = props.params.system_httpTimeout || 60;
  const headerSecret = props.params.system_header_secret;
  let requestUrl = httpReqUrl;

  if (!requestUrl) {
    return Promise.reject('Http url is empty');
  }

  const systemVariables = {
    appId,
    chatId,
    responseChatItemId,
    histories: histories?.slice(-10) || []
  };
  const concatVariables = {
    ...variableState.toRuntimeRecord(),
    ...body,
    ...systemVariables
  };
  const allVariables: Record<string, any> = {
    ...concatVariables,
    [NodeInputKeyEnum.addInputParam]: concatVariables
  };

  // General data for variable substitution（Exclude: json body)
  const replaceStringVariables = (text: string) => {
    return replaceEditorVariable({
      text,
      nodesMap: runtimeNodesMap,
      variables: allVariables
    });
  };

  requestUrl = replaceStringVariables(requestUrl);

  const publicHeaders = await (async () => {
    try {
      const contentType = contentTypeMap[httpContentType];
      const requestHeaders = contentType
        ? [{ key: 'Content-Type', value: contentType, type: 'string' }, ...httpHeader]
        : httpHeader;

      return requestHeaders.reduce((acc: Record<string, string>, item) => {
        const key = replaceStringVariables(item.key);
        const value = replaceStringVariables(item.value);
        acc[key] = valueTypeFormat(value, WorkflowIOValueTypeEnum.string);
        return acc;
      }, {});
    } catch {
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
        const formBody = httpFormBody.map((item) => ({
          key: replaceStringVariables(item.key),
          type: item.type,
          value: replaceStringVariables(item.value)
        }));
        const formData = new FormData();
        for (const { key, value } of formBody) {
          formData.append(key, value);
        }
        return formData;
      }
      if (httpContentType === ContentTypes.xWwwFormUrlencoded) {
        if (!Array.isArray(httpFormBody)) return {};
        const formBody = httpFormBody.map((item) => ({
          key: replaceStringVariables(item.key),
          type: item.type,
          value: replaceStringVariables(item.value)
        }));
        const urlSearchParams = new URLSearchParams();
        for (const { key, value } of formBody) {
          urlSearchParams.append(key, value);
        }
        return urlSearchParams;
      }
      if (!httpJsonBody) return {};
      if (httpContentType === ContentTypes.json) {
        const jsonBody = replaceJsonBodyString(
          { text: httpJsonBody },
          {
            allVariables,
            runtimeNodesMap
          }
        );
        return json5.parse(jsonBody);
      }

      // Raw text, xml
      const rawBody = replaceStringVariables(httpJsonBody);
      return rawBody.replaceAll(UNDEFINED_SIGN, 'null');
    } catch {
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
        url: requestUrl,
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
          item.id !== NodeOutputKeyEnum.httpRawError &&
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
      [DispatchNodeResponseKeyEnum.toolResponse]:
        Object.keys(results).length > 0 ? results : rawResponse
    };
  } catch (error) {
    logger.warn('HTTP tool request failed', {
      error,
      httpReqUrl: requestUrl,
      ignoreHttpsCertificate: global.systemEnv?.workflowHttpNode?.ignoreHttpsCertificate === true
    });

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

    const errText = getErrText(error);
    const errObj = formatHttpError(error);
    return getNodeErrResponse({
      error: errText,
      customErr: {
        [NodeOutputKeyEnum.error]: errText,
        [NodeOutputKeyEnum.httpRawError]: errObj
      },
      responseData: {
        params: Object.keys(params).length > 0 ? params : undefined,
        body: Object.keys(formattedRequestBody).length > 0 ? formattedRequestBody : undefined,
        headers: Object.keys(publicHeaders).length > 0 ? publicHeaders : undefined,
        httpErrorResult: errObj
      }
    });
  }
};

/* Replace the JSON string to reduce parsing errors
  1. Replace undefined values with null
  2. Replace newline strings
*/
export const replaceJsonBodyString = (
  { text, depth = 0 }: { text: string; depth?: number },
  props: {
    allVariables: Record<string, any>;
    runtimeNodesMap: Map<string, RuntimeNodeItemType>;
  }
) => {
  const { allVariables, runtimeNodesMap } = props;

  const MAX_REPLACEMENT_DEPTH = 10;

  // Prevent infinite recursion
  if (depth > MAX_REPLACEMENT_DEPTH) {
    return text;
  }
  if (checkStrOversize(text)) {
    logOversizeString({
      source: 'replaceJsonBodyString',
      reason: depth === 0 ? 'input' : 'recursive_input',
      length: text.length
    });
    return text;
  }

  /**
   * 为 replace callback 的递增 offset 做惰性引号状态扫描。
   * 旧实现每个变量都 substring + match 重新计算一次，变量多且 body 大时会放大 CPU。
   */
  const createQuoteChecker = (source: string) => {
    let cursor = 0;
    let inQuotes = false;
    let escaped = false;

    return (offset: number) => {
      while (cursor < offset) {
        const char = source[cursor];
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inQuotes = !inQuotes;
        }
        cursor++;
      }
      return inQuotes;
    };
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
      } catch {
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
  let currentDepth = depth;

  const regex1 = /\{\{\$([^.]+)\.([^$]+)\$\}\}/g;
  const regex2 = /{{([^}]+)}}/g;

  while (currentDepth <= MAX_REPLACEMENT_DEPTH && result.includes('{{')) {
    let hasReplacements = false;

    // 1. Replace {{$nodeId.id$}} variables
    const nodeReplacementCache = new Map<string, string | undefined>();
    const isNodeVariableInQuotes = createQuoteChecker(result);

    result = result.replace(
      regex1,
      (fullMatch: string, nodeId: string, id: string, offset: number) => {
        const variableKey = `${nodeId}.${id}`;

        if (nodeReplacementCache.has(variableKey)) {
          const cachedReplacement = nodeReplacementCache.get(variableKey);
          return cachedReplacement === undefined ? fullMatch : cachedReplacement;
        }

        // 检查变量是否在引号内
        const isInQuotes = isNodeVariableInQuotes(offset);

        const variableVal = (() => {
          if (nodeId === VARIABLE_NODE_ID) {
            return allVariables[id];
          }
          // Find upstream node input/output
          const node = runtimeNodesMap.get(nodeId);
          if (!node) return;

          const output = node.outputs.find((output) => output.id === id);
          if (output) return formatVariableValByType(output.value, output.valueType);

          const input = node.inputs.find((input) => input.key === id);
          if (input) {
            return getReferenceVariableValue({
              value: input.value,
              nodesMap: runtimeNodesMap,
              variables: allVariables
            });
          }
        })();

        // Check for direct circular reference
        if (hasCircularReference(String(variableVal), variableKey)) {
          nodeReplacementCache.set(variableKey, undefined);
          return fullMatch;
        }

        const formatVal = valToStr(variableVal, isInQuotes);
        nodeReplacementCache.set(variableKey, formatVal);
        if (formatVal !== fullMatch) {
          hasReplacements = true;
        }
        return formatVal;
      }
    );

    // 2. Replace {{key}} variables
    const variableReplacementCache = new Map<string, string | undefined>();
    const isVariableInQuotes = createQuoteChecker(result);

    result = result.replace(regex2, (fullMatch: string, key: string, offset: number) => {
      if (variableReplacementCache.has(key)) {
        const cachedReplacement = variableReplacementCache.get(key);
        return cachedReplacement === undefined ? fullMatch : cachedReplacement;
      }

      const variableVal = allVariables[key];

      // Check for direct circular reference
      if (hasCircularReference(variableVal, key)) {
        variableReplacementCache.set(key, undefined);
        return fullMatch;
      }

      // 检查变量是否在引号内
      const isInQuotes = isVariableInQuotes(offset);
      const formatVal = valToStr(variableVal, isInQuotes);

      variableReplacementCache.set(key, formatVal);
      if (formatVal !== fullMatch) {
        hasReplacements = true;
      }
      return formatVal;
    });

    if (checkStrOversize(result)) {
      logOversizeString({
        source: 'replaceJsonBodyString',
        reason: 'replacement_result',
        length: result.length
      });
      return result;
    }

    if (!hasReplacements) break;
    currentDepth++;
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
  if (await isInternalAddress(url)) {
    return Promise.reject(PRIVATE_URL_TEXT);
  }

  // 都认为是用户的请求，强制 SSRF 检查
  const { data: response } = await axios({
    method,
    maxContentLength: serviceRequestMaxContentLength,
    url,
    headers: {
      ...headers
    },
    timeout: timeout * 1000,
    params: params,
    data: ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined,
    ...getWorkflowHttpNodeHttpsAgentConfig(url)
  });

  return {
    formatResponse: typeof response === 'object' ? response : {},
    rawResponse: response
  };
}
