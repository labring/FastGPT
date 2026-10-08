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
  publicCertContent: textWithDefault(),
  endpoint: textWithDefault(),
  notifyUrl: urlWithDefault()
});

/** 对公转账说明。 */
const BankPayConfigSchema = z.strictObject({
  description: textWithDefault()
});

const BillingNotifySmsTemplateSchema = z.strictObject({
  zh: z.string().max(2000).default('')
});

const BillingNotifyConfigSchema = z.strictObject({
  // 充值到账通知模板
  paymentReceived: BillingNotifySmsTemplateSchema.prefault({}),
  // 余额不足预警模板
  lackOfPoints: BillingNotifySmsTemplateSchema.prefault({}),
  // 积分即将耗尽提醒模板
  pointsTenPercentRemain: BillingNotifySmsTemplateSchema.prefault({}),
  // 套餐即将到期提醒模板
  expireSoon: BillingNotifySmsTemplateSchema.prefault({}),
  // 套餐已到期提醒模板
  expired: BillingNotifySmsTemplateSchema.prefault({})
});

export const CommercialConfigSchema = z.strictObject({
  showCoupon: z.boolean().default(false),
  showDiscountCoupon: z.boolean().default(false),
  payFormUrl: urlWithDefault(),
  agentSandboxFreeTip: z.boolean().default(false),
  payment: z
    .strictObject({
      wx: WxPayConfigSchema.prefault({}),
      alipay: AlipayConfigSchema.prefault({}),
      bank: BankPayConfigSchema.prefault({})
    })
    .prefault({}),
  billingNotify: BillingNotifyConfigSchema.prefault({})
});
