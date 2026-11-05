import {
  UsageExportConflictSchema,
  type ExportUsageBodyType
} from '@fastgpt/global/openapi/support/wallet/usage/api';
import { getWebReqUrl } from '@fastgpt/web/common/system/utils';
import { getErrorMessage } from '@fastgpt/global/common/error/utils';
import { getLanguageRequestHeaders } from '@fastgpt/web/i18n/utils';
import {
  FASTGPT_WEB_REQUEST_HEADER,
  FASTGPT_WEB_REQUEST_VALUE
} from '@fastgpt/global/common/system/constants';

/** 仅允许 200 CSV 下载；409 返回可校验上下文，禁止把 JSON 保存为文件或自动重试。 */
export const downloadUsage = async ({
  body,
  signal,
  isCurrent
}: {
  body: ExportUsageBodyType;
  signal?: AbortSignal;
  isCurrent: () => boolean;
}) => {
  const response = await fetch(getWebReqUrl('/api/proApi/support/wallet/usage/exportUsage'), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      [FASTGPT_WEB_REQUEST_HEADER]: FASTGPT_WEB_REQUEST_VALUE,
      ...getLanguageRequestHeaders()
    },
    body: JSON.stringify(body)
  });
  const contentType = response.headers.get('Content-Type') ?? '';
  if (response.status === 409 && contentType.includes('application/json')) {
    const envelope = await response.json();
    return { kind: 'conflict' as const, ...UsageExportConflictSchema.parse(envelope.data) };
  }
  if (response.status !== 200 || !contentType.includes('text/csv')) {
    const text = await response.text();
    let message = text || response.statusText;
    let statusText: string | undefined;
    try {
      const error = JSON.parse(text);
      message = getErrorMessage(error, message);
      statusText = error.statusText;
    } catch {
      // 网关也可能返回纯文本错误，保留 HTTP 状态供页面清理失效权限数据。
    }
    throw Object.assign(new Error(message), { code: response.status, statusText });
  }
  const blob = await response.blob();
  if (!isCurrent()) return { kind: 'stale' as const };
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'usage.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return { kind: 'downloaded' as const };
};
