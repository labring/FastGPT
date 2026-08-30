import { StandardSubLevelEnum, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';

export enum PackageChangeStatusEnum {
  buy = 'buy',
  renewal = 'renewal',
  upgrade = 'upgrade'
}

const PRICE_PURCHASE_INTENT_KEY = 'fastgpt-price-purchase-intent';
const PURCHASE_INTENT_TTL = 30 * 60 * 1000;
const PURCHASABLE_STANDARD_LEVELS = [
  StandardSubLevelEnum.free,
  StandardSubLevelEnum.basic,
  StandardSubLevelEnum.advanced,
  StandardSubLevelEnum.custom
] as const;

export type PricePurchaseIntent =
  | {
      type: 'standard';
      packageChange: PackageChangeStatusEnum;
      level: `${StandardSubLevelEnum}`;
      subMode: `${SubModeEnum}`;
    }
  | {
      type: 'extraPoints';
      points: number;
      month: number;
    }
  | {
      type: 'extraDataset';
      datasetSize: number;
      month: number;
    };

type StoredPurchaseIntent = {
  expiresAt: number;
  intent: PricePurchaseIntent;
};

const getSessionStorage = () => {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
};

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** 校验浏览器临时存储中的购买意图，避免损坏或手工篡改的数据触发支付请求。 */
const isPricePurchaseIntent = (value: unknown): value is PricePurchaseIntent => {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;

  if (value.type === 'standard') {
    return (
      'packageChange' in value &&
      Object.values(PackageChangeStatusEnum).includes(
        value.packageChange as PackageChangeStatusEnum
      ) &&
      'level' in value &&
      PURCHASABLE_STANDARD_LEVELS.includes(
        value.level as (typeof PURCHASABLE_STANDARD_LEVELS)[number]
      ) &&
      'subMode' in value &&
      Object.values(SubModeEnum).includes(value.subMode as SubModeEnum)
    );
  }

  if (value.type === 'extraPoints') {
    return (
      'points' in value &&
      isPositiveNumber(value.points) &&
      'month' in value &&
      isPositiveNumber(value.month)
    );
  }

  return (
    value.type === 'extraDataset' &&
    'datasetSize' in value &&
    isPositiveNumber(value.datasetSize) &&
    'month' in value &&
    isPositiveNumber(value.month)
  );
};

/** 保存短期、当前标签页独享的购买意图，供登录回跳后恢复。 */
export const savePricePurchaseIntent = (
  intent: PricePurchaseIntent,
  storage = getSessionStorage(),
  now = Date.now()
) => {
  if (!storage) return false;

  try {
    storage.setItem(
      PRICE_PURCHASE_INTENT_KEY,
      JSON.stringify({
        expiresAt: now + PURCHASE_INTENT_TTL,
        intent
      } satisfies StoredPurchaseIntent)
    );
    return true;
  } catch {
    return false;
  }
};

/**
 * 一次性读取购买意图。读取前先删除，即使解析或后续支付失败，刷新页面也不会重复创建订单。
 */
export const consumePricePurchaseIntent = (
  storage = getSessionStorage(),
  now = Date.now()
): PricePurchaseIntent | undefined => {
  if (!storage) return;

  try {
    const value = storage.getItem(PRICE_PURCHASE_INTENT_KEY);
    storage.removeItem(PRICE_PURCHASE_INTENT_KEY);
    if (!value) return;

    const stored = JSON.parse(value) as Partial<StoredPurchaseIntent>;
    if (
      typeof stored.expiresAt !== 'number' ||
      stored.expiresAt <= now ||
      !isPricePurchaseIntent(stored.intent)
    ) {
      return;
    }

    return stored.intent;
  } catch {
    return;
  }
};
