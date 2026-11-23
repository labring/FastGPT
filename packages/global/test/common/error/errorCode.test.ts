import { describe, expect, it } from 'vitest';
import {
  ERROR_ENUM,
  ERROR_RESPONSE,
  type ErrorHttpStatus
} from '@fastgpt/global/common/error/errorCode';
import appErr, { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import chatErr, { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import commonErr, { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import couponErr, { CouponErrEnum } from '@fastgpt/global/common/error/code/coupon';
import datasetErr, { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import modelErr, { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import openapiErr, { OpenApiErrEnum } from '@fastgpt/global/common/error/code/openapi';
import outLinkErr, { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import pluginErr, { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import s3Err from '@fastgpt/global/common/error/code/s3';
import sandboxErr, { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import skillErr, { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import systemErr, { SystemErrEnum } from '@fastgpt/global/common/error/code/system';
import teamErr, { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import userErr, { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { EnterpriseAuthErrEnum } from '@fastgpt/global/support/user/team/enterpriseAuth/constant';

const ALLOWED_ERROR_HTTP_STATUSES = new Set<ErrorHttpStatus>([
  400, 401, 402, 403, 404, 405, 406, 409, 410, 413, 422, 429, 500, 502, 503, 504
]);

describe('ERROR_RESPONSE HTTP status contract', () => {
  it('requires every registered ERROR_RESPONSE entry to declare a valid 4xx/5xx httpStatus', () => {
    const entries = Object.entries(ERROR_RESPONSE);
    expect(entries.length).toBeGreaterThan(100);

    for (const [key, entry] of entries) {
      expect(
        ALLOWED_ERROR_HTTP_STATUSES.has(entry.httpStatus),
        `ERROR_RESPONSE[${key}] has invalid httpStatus: ${String(entry.httpStatus)}`
      ).toBe(true);
      expect(typeof entry.code).toBe('number');
      expect(entry.statusText).toBe(key);
    }
  });

  it('prevents new accidental statusText overrides across domain error tables', () => {
    const tables: Array<{ name: string; map: Record<string, unknown> }> = [
      {
        name: 'core',
        map: Object.fromEntries(Object.values(ERROR_ENUM).map((key) => [key, true]))
      },
      { name: 'app', map: appErr },
      { name: 'chat', map: chatErr },
      { name: 'dataset', map: datasetErr },
      { name: 'openapi', map: openapiErr },
      { name: 'outLink', map: outLinkErr },
      { name: 'team', map: teamErr },
      { name: 'user', map: userErr },
      { name: 'plugin', map: pluginErr },
      { name: 'common', map: commonErr },
      { name: 's3', map: s3Err },
      { name: 'system', map: systemErr },
      { name: 'skill', map: skillErr },
      { name: 'sandbox', map: sandboxErr },
      { name: 'coupon', map: couponErr },
      { name: 'model', map: modelErr }
    ];

    const seen = new Map<string, string[]>();
    for (const table of tables) {
      for (const key of Object.keys(table.map)) {
        const owners = seen.get(key) ?? [];
        owners.push(table.name);
        seen.set(key, owners);
      }
    }

    const duplicates = Object.fromEntries(
      Array.from(seen.entries())
        .filter(([, owners]) => owners.length > 1)
        .sort(([a], [b]) => a.localeCompare(b))
    );

    // 锁定历史上已存在的跨表同名 key，新增错误码不得继续引入静默覆盖。
    expect(duplicates).toEqual({
      accountCancellationPending: ['team', 'user'],
      canNotEditAdminPermission: ['app', 'dataset', 'skill'],
      notUser: ['team', 'user'],
      unAuthFile: ['core', 'common'],
      unAuthModel: ['core', 'model']
    });
  });

  it.each([
    [ERROR_ENUM.unAuthorization, 401, 401],
    [ERROR_ENUM.unAuthProToken, 401, 401],
    [ERROR_ENUM.unAuthApiKey, 514, 401],
    [ERROR_ENUM.insufficientQuota, 510, 402],
    [TeamErrEnum.aiPointsNotEnough, 500005, 402],
    [ModelErrEnum.unAuthModel, 513004, 403],
    [CommonErrEnum.unAuthFile, 507003, 403],
    [CommonErrEnum.unAuthFileKey, 507016, 403],
    [AppErrEnum.unAuthApp, 502001, 403],
    [DatasetErrEnum.unAuthDataset, 501004, 403],
    [ChatErrEnum.unAuthChat, 504000, 403],
    [OpenApiErrEnum.unAuth, 506001, 403],
    [OpenApiErrEnum.exceedLimit, 506002, 403],
    [OutLinkErrEnum.linkUnInvalid, 501, 403],
    [OutLinkErrEnum.unAuthUser, 505003, 401],
    [PluginErrEnum.unAuth, 508001, 403],
    [SkillErrEnum.unAuthSkill, 509001, 403],
    [SystemErrEnum.communityVersionNumLimit, 509000, 403],
    [AppErrEnum.unExist, 502000, 404],
    [DatasetErrEnum.unExist, 501002, 404],
    [ModelErrEnum.unExist, 513000, 404],
    [ModelErrEnum.unConfigured, 513001, 500],
    [UserErrEnum.notUser, 503000, 404],
    [UserErrEnum.account_psw_error, 503002, 401],
    [UserErrEnum.unAuthSso, 503003, 401],
    [ChatErrEnum.chatIsGenerating, 504001, 409],
    [DatasetErrEnum.dataNotIndexed, 501016, 409],
    [EnterpriseAuthErrEnum.taskExpired, 500042, 410],
    [CouponErrEnum.invalid, 512000, 400],
    [CommonErrEnum.invalidParams, 507000, 400],
    [CommonErrEnum.pdfEncrypted, 507009, 422],
    [SkillErrEnum.noStorage, 509007, 422],
    [TeamErrEnum.tooManyInvitations, 500029, 429],
    [SandboxErrEnum.runtimeUpgradeFailed, 510002, 500],
    [CommonErrEnum.pdfParseFailed, 507008, 500],
    [DatasetErrEnum.externalChunkFailed, 501013, 502],
    [DatasetErrEnum.externalChunkNotConfigured, 501015, 503],
    [EnterpriseAuthErrEnum.serviceNotConfigured, 500033, 503],
    [EnterpriseAuthErrEnum.serviceTimeout, 500039, 504]
  ] as const)(
    'maps %s to stable business code %i and HTTP status %i',
    (errorKey, expectedCode, expectedHttpStatus) => {
      expect(ERROR_RESPONSE[errorKey]).toMatchObject({
        code: expectedCode,
        statusText: errorKey,
        httpStatus: expectedHttpStatus
      });
    }
  );
});
