import type { ClientSession, FilterQuery } from 'mongoose';
import { AccountVerificationMaterialTypeEnum } from '@fastgpt/global/support/user/account/verification/constants';
import type { CodeAccountVerificationScene } from '@fastgpt/global/support/user/account/verification/type';
import {
  MongoAccountVerificationMaterial,
  type AccountVerificationMaterialSchemaType
} from './schema';
import { buildVerificationCodeFilter } from './utils';

type MaterialIdentity = {
  key: string;
  type: `${AccountVerificationMaterialTypeEnum}`;
  scene?: CodeAccountVerificationScene;
  userIdHash?: string;
  purpose?: 'login' | 'accountCancellation';
  provider?: string;
  callbackHash?: string;
};

type CreateVerificationMaterialData = MaterialIdentity & {
  code?: string;
  openid?: string;
  scene?: string;
  expiredTime: Date;
  createTime?: Date;
};

type QueryValidVerificationMaterialData = MaterialIdentity & {
  code?: string;
  caseInsensitiveCode?: boolean;
  requireOpenid?: boolean;
  now?: Date;
};

/** 创建随机键材料。调用方负责处理极低概率的唯一键碰撞。 */
export const createVerificationMaterial = (
  data: CreateVerificationMaterialData,
  session?: ClientSession
) =>
  MongoAccountVerificationMaterial.create(
    [
      {
        ...data,
        createTime: data.createTime ?? new Date()
      }
    ],
    { session }
  );

/** 查询同一 key/type 是否已经存在，用于随机材料创建前的碰撞检测。 */
export const findVerificationMaterial = (data: MaterialIdentity, session?: ClientSession) =>
  MongoAccountVerificationMaterial.findOne(data, undefined, { session }).lean();

/** 覆盖同一 key/type 的普通验证码，并同步刷新创建和过期时间。 */
export const upsertVerificationMaterial = (
  data: CreateVerificationMaterialData,
  session?: ClientSession
) => {
  const {
    key,
    type,
    code,
    openid,
    scene,
    expiredTime,
    createTime = new Date(),
    userIdHash,
    purpose,
    provider,
    callbackHash
  } = data;

  return MongoAccountVerificationMaterial.updateOne(
    { key, type },
    {
      $set: {
        code,
        openid,
        scene,
        userIdHash,
        purpose,
        provider,
        callbackHash,
        createTime,
        expiredTime
      }
    },
    { upsert: true, session }
  );
};

const buildValidMaterialFilter = ({
  key,
  type,
  code,
  caseInsensitiveCode,
  requireOpenid,
  scene,
  userIdHash,
  purpose,
  provider,
  callbackHash,
  now = new Date()
}: QueryValidVerificationMaterialData): FilterQuery<AccountVerificationMaterialSchemaType> => ({
  key,
  type,
  expiredTime: { $gt: now },
  ...(code !== undefined && {
    code: buildVerificationCodeFilter({ code, caseInsensitive: caseInsensitiveCode })
  }),
  ...(requireOpenid && { openid: { $exists: true, $ne: '' } }),
  ...(scene !== undefined && { scene }),
  ...(userIdHash !== undefined && { userIdHash }),
  ...(purpose !== undefined && { purpose }),
  ...(provider !== undefined && { provider }),
  ...(callbackHash !== undefined && { callbackHash })
});

/** 查询仍在业务有效期内的材料，不依赖 TTL 清理时机。 */
export const findValidVerificationMaterial = (
  data: QueryValidVerificationMaterialData,
  session?: ClientSession
) =>
  MongoAccountVerificationMaterial.findOne(buildValidMaterialFilter(data), undefined, {
    session
  }).lean();

/** 原子消费仍有效的材料，并返回被删除记录。 */
export const consumeVerificationMaterial = (
  data: QueryValidVerificationMaterialData,
  session?: ClientSession
) =>
  MongoAccountVerificationMaterial.findOneAndDelete(buildValidMaterialFilter(data), {
    session
  }).lean();

/** 微信 callback 只能把身份写入已存在、未过期且尚未完成的占位材料。 */
export const updateWechatMaterialIdentity = (
  {
    key,
    openid,
    materialType = AccountVerificationMaterialTypeEnum.wxLogin,
    userIdHash,
    purpose,
    now = new Date()
  }: {
    key: string;
    openid: string;
    materialType?: `${AccountVerificationMaterialTypeEnum}`;
    userIdHash?: string;
    purpose?: 'login' | 'accountCancellation';
    now?: Date;
  },
  session?: ClientSession
) =>
  MongoAccountVerificationMaterial.findOneAndUpdate(
    {
      key,
      type: materialType,
      expiredTime: { $gt: now },
      openid: { $exists: false },
      ...(userIdHash !== undefined && { userIdHash }),
      ...(purpose !== undefined && { purpose })
    },
    { $set: { openid } },
    { new: true, session }
  ).lean();

/** 上游创建失败时按本次材料内容条件清理，避免误删并发重试的新材料。 */
export const deleteVerificationMaterialIfMatch = (
  {
    key,
    type,
    scene,
    code,
    openid,
    userIdHash,
    purpose,
    provider,
    callbackHash
  }: MaterialIdentity & {
    code?: string;
    openid?: string;
  },
  session?: ClientSession
) =>
  MongoAccountVerificationMaterial.deleteOne(
    {
      key,
      type,
      ...(scene !== undefined && { scene }),
      ...(code !== undefined && { code }),
      ...(openid !== undefined && { openid }),
      ...(userIdHash !== undefined && { userIdHash }),
      ...(purpose !== undefined && { purpose }),
      ...(provider !== undefined && { provider }),
      ...(callbackHash !== undefined && { callbackHash })
    },
    { session }
  );
