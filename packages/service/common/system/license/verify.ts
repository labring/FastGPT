/**
 * License 验证核心（决策版）— 无 DB/业务全局依赖，pro/admin 与 app 共用；公钥从服务环境读取。
 *
 * 设计（决策版 §2/§3）：
 * - payload 决策版结构：schemaVersion=2、licenseType、limits{}、functions 显式全字段
 * - 旧 license（schemaVersion=1，无 instanceId/limits，functions 含 batchEval/customTemplates）
 *   通过 normalizeLicenseData 归一化为决策版结构；customTemplates/networkIds 不入新结构
 * - 有效期：startTime <= now < expiredTime
 * - 验签对象是 base64 payload 字符串字节（RSA-SHA256），与签发侧一致
 */
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { serviceEnv } from '../../../env';
import type { LicenseDataType, LicenseFunctions } from '@fastgpt/global/common/system/types';

/** 读取与 license-server 配对的公钥；不支持多把 key，轮换由重新部署配置完成。 */
const getLicensePublicKey = () => {
  if (serviceEnv.LICENSE_PUBLIC_KEY_PATH) {
    return readFileSync(serviceEnv.LICENSE_PUBLIC_KEY_PATH, 'utf8');
  }
  if (serviceEnv.LICENSE_PUBLIC_KEY) return serviceEnv.LICENSE_PUBLIC_KEY.replace(/\\n/g, '\n');
  throw new Error('未配置 LICENSE_PUBLIC_KEY 或 LICENSE_PUBLIC_KEY_PATH');
};

/** RSA-4096 签名 base64 长度（512 字节） */
export const signatureLength = 684;

/** 决策版 functions 全字段默认关闭（缺失字段归一化补 false）。类型标注 LicenseFunctions，schema 键变化即编译报错 */
export const licenseDefaultFunctions: LicenseFunctions = {
  sso: false,
  pay: false,
  eval: false,
  datasetEnhance: false,
  assistantGenerate: false,
  portal: false,
  sandboxSkills: false
};

/**
 * 校验签名并解析 payload。
 * @returns 原始解析对象（未归一化），供 normalizeLicenseData 消费
 * @throws 验签失败 / 非合法 base64 JSON
 */
export const verifyLicenseSignature = (license: string) => {
  const signature = license.substring(0, signatureLength);
  const payloadBase64 = license.substring(signatureLength);

  const verified = crypto
    .createVerify('RSA-SHA256')
    .update(payloadBase64)
    .verify(getLicensePublicKey(), signature, 'base64');

  if (!verified) {
    throw new Error('License 签名不合法');
  }

  return JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8')) as Record<string, any>;
};

/**
 * 归一化为决策版结构（旧 schemaVersion=1 → 决策版）。
 * - schemaVersion 缺省视为 1；licenseType 缺省 official
 * - 旧顶层 maxUsers/maxApps/maxDatasets → limits；旧 batchEval → eval
 * - customTemplates/networkIds/hosts 不进入新结构（hosts 仅读兼容，不校验）
 * - functions 缺失字段补 false（决策版：functions 是唯一授权来源，默认关闭）
 */
export const normalizeLicenseData = (raw: Record<string, any>): LicenseDataType => {
  const limits = raw.limits ?? {
    maxUsers: raw.maxUsers ?? 0,
    maxApps: raw.maxApps ?? 0,
    maxDatasets: raw.maxDatasets ?? 0
  };

  const oldFunctions = raw.functions ?? {};
  const functions = {
    sso: oldFunctions.sso ?? false,
    pay: oldFunctions.pay ?? false,
    eval: oldFunctions.eval ?? oldFunctions.batchEval ?? false, // 旧 batchEval 归一化
    datasetEnhance: oldFunctions.datasetEnhance ?? false,
    assistantGenerate: oldFunctions.assistantGenerate ?? false,
    portal: oldFunctions.portal ?? false,
    sandboxSkills: oldFunctions.sandboxSkills ?? false
  };

  return {
    schemaVersion: raw.schemaVersion ?? 1,
    licenseType: raw.licenseType ?? 'official',
    startTime: raw.startTime,
    expiredTime: raw.expiredTime,
    company: raw.company,
    description: raw.description,
    instanceId: raw.instanceId,
    limits,
    functions: {
      ...functions,
      // deprecated 兼容键：旧 UI 读 batchEval/customTemplates，回填避免回归（新 license 不签发）
      batchEval: functions.eval,
      customTemplates: false
    },
    // deprecated 兼容视图：旧 UI 读顶层 maxUsers/maxApps/maxDatasets，回填避免回归（新代码读 limits）
    maxUsers: limits.maxUsers || undefined,
    maxApps: limits.maxApps || undefined,
    maxDatasets: limits.maxDatasets || undefined,
    hosts: raw.hosts // 仅兼容读取，不参与校验（决策版：新 license 不用 hosts）
  };
};
/** 决策版有效期判定：startTime <= now < expiredTime。 */
export const isLicenseExpired = (
  data: { startTime: string; expiredTime: string },
  now = new Date()
) => {
  const start = new Date(data.startTime).getTime();
  const end = new Date(data.expiredTime).getTime();
  const current = now.getTime();
  return current < start || current >= end;
};
