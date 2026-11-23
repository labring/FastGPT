import z from 'zod';
import {
  UpdateUserFeedbackBodyRawSchema,
  type UpdateUserFeedbackResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../shared/errors';
import { redactValue } from '../../shared/redact';
import { createChangedResult, createDryRunResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';
import type { ResolvedCredential } from '../auth/auth-resolver';
import { assertAppChatTarget } from './chat-target-guard';

export type ChatFeedbackCredential = Pick<ResolvedCredential, 'kind' | 'boundAppId'>;

export type ChatFeedbackService = {
  update: (params: {
    client: FastGptHttpClient;
    input: unknown;
    credential?: ChatFeedbackCredential;
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

/**
 * App 对话用户反馈领域服务：
 * 沿用 chat-service 的 App 会话凭证与身份门禁，支持赞/踩更新、--clear 清除以及脱敏 --dry-run 预览。
 */
export function createChatFeedbackService(): ChatFeedbackService {
  return {
    update: async ({ client, input, credential, dryRun }) => {
      const raw = z.record(z.string(), z.unknown()).parse(input);
      const { clear: rawClear, ...payload } = raw;
      if (rawClear !== undefined && typeof rawClear !== 'boolean') {
        throw new CliArgumentError('--clear must be a boolean.');
      }
      const clear = rawClear === true;

      assertAppChatTarget({
        payload,
        credential,
        domainLabel: 'Chat feedback commands'
      });

      // 2. --clear 与 --good/--bad 互斥；清除时省略两个字段，触发服务端 $unset。
      const hasGood = payload.userGoodFeedback !== undefined;
      const hasBad = payload.userBadFeedback !== undefined;
      if (clear && (hasGood || hasBad)) {
        throw new CliArgumentError('--clear is mutually exclusive with --good and --bad.');
      }
      if (!clear && !hasGood && !hasBad) {
        throw new CliArgumentError('Provide --good <text>, --bad <text>, or --clear.');
      }

      const validated = UpdateUserFeedbackBodyRawSchema.parse(payload);
      const request = {
        method: 'POST' as const,
        path: '/core/chat/feedback/updateUserFeedback',
        body: validated
      };

      if (dryRun) {
        return createDryRunResult({
          operation: 'chat feedback update',
          risk: 'write',
          preview: redactValue(request)
        });
      }

      const data = await client.request<UpdateUserFeedbackResponseType>(request);
      return createChangedResult({
        data,
        message: clear ? 'Cleared user feedback.' : 'Updated user feedback.'
      });
    }
  };
}
