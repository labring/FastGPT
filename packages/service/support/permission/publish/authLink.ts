import { type AppDetailType } from '@fastgpt/global/core/app/type';
import { type OutlinkAppType, type OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { MongoOutLink } from '../../outLink/schema';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '../app/auth';
import { type AuthModeType, type AuthResponseType } from '../type';
import { parseHeaderCert } from '../auth/common';
import type { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { z } from 'zod';
import { getLogger, LogCategories } from '../../../common/logger';

const logger = getLogger(LogCategories.MODULE.OUTLINK);

/* crud outlink permission */
export async function authOutLinkCrud({
  outLinkId,
  per = OwnerPermissionVal,
  ...props
}: AuthModeType & {
  outLinkId: string;
}): Promise<
  AuthResponseType & {
    app: AppDetailType;
    outLink: OutLinkSchemaType;
  }
> {
  const result = await parseHeaderCert(props);
  const { tmbId, teamId } = result;

  const { app, outLink } = await (async () => {
    const outLink = await MongoOutLink.findOne({ _id: outLinkId, teamId });
    if (!outLink) {
      return Promise.reject(OutLinkErrEnum.unExist);
    }

    if (String(outLink.teamId) !== teamId) {
      return Promise.reject(OutLinkErrEnum.unAuthLink);
    }

    const { app } = await authAppByTmbId({
      tmbId,
      appId: outLink.appId,
      per
    });

    return {
      outLink,
      app
    };
  })();

  return {
    ...result,
    permission: app.permission,
    app,
    outLink
  };
}

/* outLink exist and it app exist */
export async function authOutLinkValid<T extends OutlinkAppType = any>({
  shareId
}: {
  shareId?: string;
}) {
  if (!shareId) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }
  const outLinkConfig = await MongoOutLink.findOne({ shareId }).lean<OutLinkSchemaType<T>>();

  if (!outLinkConfig) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }

  return {
    appId: outLinkConfig.appId,
    outLinkConfig: outLinkConfig
  };
}

/**
 * Loads provider config by channel and validates the stored app payload instead of trusting the
 * TypeScript generic.
 */
export async function loadOutlinkProviderConfig<T extends OutlinkAppType>({
  shareId,
  channel,
  appSchema
}: {
  shareId?: string;
  channel: PublishChannelEnum;
  appSchema: z.ZodType<T>;
}): Promise<OutLinkSchemaType<T>> {
  if (!shareId) return Promise.reject(OutLinkErrEnum.linkUnInvalid);

  const outLinkConfig = await MongoOutLink.findOne({
    shareId,
    type: channel
  }).lean<OutLinkSchemaType>();
  if (!outLinkConfig) return Promise.reject(OutLinkErrEnum.linkUnInvalid);

  const appResult = appSchema.safeParse(outLinkConfig.app);
  if (!appResult.success) {
    logger.warn('Invalid outlink provider config', {
      shareId,
      channel,
      issues: appResult.error.issues.map(({ code, path }) => ({ code, path }))
    });
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }

  return {
    ...outLinkConfig,
    app: appResult.data
  };
}
