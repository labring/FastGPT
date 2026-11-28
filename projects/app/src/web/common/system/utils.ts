import type {
  FastGPTFeConfigsType,
  FastGPTRegisterMethodType
} from '@fastgpt/global/common/system/types';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { getLanguageRequestHeaders } from '@fastgpt/web/i18n/utils';
import { parseContentDispositionFilename } from '@fastgpt/global/common/file/tools';
import { getErrorMessage } from '@fastgpt/global/common/error/utils';
import {
  FASTGPT_WEB_REQUEST_HEADER,
  FASTGPT_WEB_REQUEST_VALUE
} from '@fastgpt/global/common/system/constants';

/**
 * 判断是否为成员同步模式（由权威字段 teamMode 决定）。
 */
export const getIsMemberSyncMode = (feConfigs?: Pick<FastGPTFeConfigsType, 'teamMode'>) =>
  feConfigs?.teamMode === 'sync';

/**
 * 获取当前商业版可用的邮箱/手机号登录（含验证码登录与自动建号）渠道。
 * 开源版（isPlus === false）与成员同步模式（sync）均不开放。
 */
export const getLoginMethods = (
  feConfigs?: Pick<FastGPTFeConfigsType, 'login_method' | 'teamMode' | 'isPlus'>
): FastGPTRegisterMethodType[] => {
  if (feConfigs?.isPlus === false || getIsMemberSyncMode(feConfigs)) return [];

  return (
    feConfigs?.login_method?.filter(
      (method): method is FastGPTRegisterMethodType => method === 'email' || method === 'phone'
    ) ?? []
  );
};

/**
 * 发起带主站路径前缀、Web 请求标识和语言头的 fetch 请求。
 * 非 2xx 时提取 JSON 协议错误消息（非 JSON 保留原文，空响应回退 HTTP 状态文案）并抛错，交由调用方翻译和提示。
 */
export const fetchApiResponse = async ({
  url,
  body
}: {
  url: string;
  body?: Record<string, any>;
}) => {
  const response = await fetch(getWebReqUrl(url), {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      [FASTGPT_WEB_REQUEST_HEADER]: FASTGPT_WEB_REQUEST_VALUE,
      ...getLanguageRequestHeaders()
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  if (!response.ok) {
    const responseText = await response.text();
    const message = (() => {
      try {
        return getErrorMessage(JSON.parse(responseText), response.statusText);
      } catch {
        return responseText || response.statusText;
      }
    })();
    throw new Error(message);
  }

  return response;
};

/**
 * 下载文件；接口失败时由 `fetchApiResponse` 提取错误消息，交由调用方翻译和提示。
 * 未显式指定 `filename` 时优先从响应头 `Content-Disposition` 解析，缺失时回退到 `fallbackFilename`。
 */
export const downloadFetch = async ({
  url,
  filename,
  fallbackFilename,
  body,
  waitResponse = false
}: {
  url: string;
  filename?: string;
  fallbackFilename?: string;
  body?: Record<string, any>;
  waitResponse?: boolean;
}) => {
  const shouldFetch = body || waitResponse || url.startsWith('/api');
  if (shouldFetch) {
    const response = await fetchApiResponse({ url, body });

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    // 显式传入 filename（含空字符串）时原样保留，仅在省略时按响应头和兜底名推导。
    const resolvedFilename =
      filename ??
      (parseContentDispositionFilename(response.headers.get('Content-Disposition') || '') ||
        fallbackFilename ||
        'download');

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = resolvedFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // clean up the blob URL
    window.URL.revokeObjectURL(downloadUrl);
  } else {
    const directDownloadName = filename ?? fallbackFilename;
    const a = document.createElement('a');
    a.href = url;
    if (directDownloadName !== undefined) {
      a.download = directDownloadName;
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
};
