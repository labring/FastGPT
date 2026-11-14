import z from 'zod';
import { textWithDefault, urlWithDefault } from './primitives';

/** 微信支付商户凭据。 */
const WxPayConfigSchema = z.strictObject({
  appId: textWithDefault(),
  mchId: textWithDefault(),
  serialNo: textWithDefault(),
  apiV3Key: textWithDefault(),
  notifyUrl: urlWithDefault(),
  privateKey: textWithDefault()
});

/** 支付宝应用凭据与证书。 */
const AlipayConfigSchema = z.strictObject({
  appId: textWithDefault(),
  appPrivateKey: textWithDefault(),
  appCertContent: textWithDefault(),
  gateway: textWithDefault(),
  rootCertContent: textWithDefault(),
  publicCertContent: textWithDefault()
});

/** 对公转账说明。 */
const BankPayConfigSchema = z.strictObject({
  description: textWithDefault()
});

const BillingNotifySmsTemplateSchema = z.strictObject({
  zh: z.string().max(2000).default('')
});

const BillingNotifyConfigSchema = z.strictObject({
  // 余额不足预警模板
  lackOfPoints: BillingNotifySmsTemplateSchema.prefault({}),
  // 积分剩余 30% 预警模板
  pointsThirtyPercentRemain: BillingNotifySmsTemplateSchema.prefault({}),
  // 积分即将耗尽提醒模板
  pointsTenPercentRemain: BillingNotifySmsTemplateSchema.prefault({}),
  // 免费版知识库清理预警模板
  freeClean: BillingNotifySmsTemplateSchema.prefault({}),
  // 套餐即将到期提醒模板
  expireSoon: BillingNotifySmsTemplateSchema.prefault({}),
  // 套餐已到期提醒模板
  expired: BillingNotifySmsTemplateSchema.prefault({})
});

export const CommercialConfigSchema = z.strictObject({
  showCoupon: z.boolean().default(false),
  showDiscountCoupon: z.boolean().default(false),
  payFormUrl: urlWithDefault(),
  // 沙箱免费提示保持 ENV 权威（AGENT_SANDBOX_SHOW_FREE_TIP）：
  // 实例配置里没有任何消费点，先不建字段，避免写入后无人读取的僵尸配置。
  // 曾写入过该字段的存量 overrides 由 20260929 清理任务删除，否则 strictObject 读取会抛错。
  payment: z
    .strictObject({
      wx: WxPayConfigSchema.prefault({}),
      alipay: AlipayConfigSchema.prefault({}),
      bank: BankPayConfigSchema.prefault({})
    })
    .prefault({}),
  billingNotify: BillingNotifyConfigSchema.prefault({})
});
