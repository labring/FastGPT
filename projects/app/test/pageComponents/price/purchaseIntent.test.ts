import { describe, expect, it } from 'vitest';
import { StandardSubLevelEnum, SubModeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import {
  consumePricePurchaseIntent,
  getStandardPackageChangeStatus,
  PackageChangeStatusEnum,
  savePricePurchaseIntent
} from '@/pageComponents/price/purchaseIntent';

const createStorage = () => {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value)
  } satisfies Storage;
};

describe('getStandardPackageChangeStatus', () => {
  it('无当前套餐时按首次购买处理', () => {
    expect(
      getStandardPackageChangeStatus({
        targetLevel: StandardSubLevelEnum.advanced
      })
    ).toBe(PackageChangeStatusEnum.buy);
  });

  it('根据当前套餐判定续费、升级和购买', () => {
    expect(
      getStandardPackageChangeStatus({
        currentLevel: StandardSubLevelEnum.basic,
        targetLevel: StandardSubLevelEnum.basic
      })
    ).toBe(PackageChangeStatusEnum.renewal);
    expect(
      getStandardPackageChangeStatus({
        currentLevel: StandardSubLevelEnum.basic,
        targetLevel: StandardSubLevelEnum.advanced
      })
    ).toBe(PackageChangeStatusEnum.upgrade);
    expect(
      getStandardPackageChangeStatus({
        currentLevel: StandardSubLevelEnum.advanced,
        targetLevel: StandardSubLevelEnum.basic
      })
    ).toBe(PackageChangeStatusEnum.buy);
  });
});

describe('savePricePurchaseIntent and consumePricePurchaseIntent', () => {
  it('保存并且只消费一次有效购买意图', () => {
    const storage = createStorage();
    const intent = {
      type: 'standard',
      packageChange: PackageChangeStatusEnum.upgrade,
      level: StandardSubLevelEnum.advanced,
      subMode: SubModeEnum.year
    } as const;

    expect(savePricePurchaseIntent(intent, storage, 1000)).toBe(true);
    expect(consumePricePurchaseIntent(storage, 2000)).toEqual(intent);
    expect(consumePricePurchaseIntent(storage, 2000)).toBeUndefined();
  });

  it('支持恢复两类额外套餐购买参数', () => {
    const storage = createStorage();
    const intents = [
      { type: 'extraPoints', points: 1000, month: 12 },
      { type: 'extraDataset', datasetSize: 10, month: 3 }
    ] as const;

    for (const intent of intents) {
      savePricePurchaseIntent(intent, storage, 1000);
      expect(consumePricePurchaseIntent(storage, 2000)).toEqual(intent);
    }
  });

  it('丢弃过期、损坏和参数非法的购买意图', () => {
    const storage = createStorage();
    savePricePurchaseIntent({ type: 'extraPoints', points: 1000, month: 1 }, storage, 1000);
    expect(consumePricePurchaseIntent(storage, 31 * 60 * 1000)).toBeUndefined();

    storage.setItem('fastgpt-price-purchase-intent', '{invalid-json');
    expect(consumePricePurchaseIntent(storage, 1000)).toBeUndefined();

    storage.setItem(
      'fastgpt-price-purchase-intent',
      JSON.stringify({
        expiresAt: 2000,
        intent: { type: 'extraDataset', datasetSize: -1, month: 1 }
      })
    );
    expect(consumePricePurchaseIntent(storage, 1000)).toBeUndefined();

    storage.setItem(
      'fastgpt-price-purchase-intent',
      JSON.stringify({
        expiresAt: 2000,
        intent: {
          type: 'standard',
          packageChange: PackageChangeStatusEnum.buy,
          level: StandardSubLevelEnum.enterprise,
          subMode: SubModeEnum.month
        }
      })
    );
    expect(consumePricePurchaseIntent(storage, 1000)).toBeUndefined();
  });

  it('存储不可用时安全降级', () => {
    const storage = {
      ...createStorage(),
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      }
    } satisfies Storage;

    expect(
      savePricePurchaseIntent({ type: 'extraDataset', datasetSize: 1, month: 1 }, storage)
    ).toBe(false);
    expect(consumePricePurchaseIntent(storage)).toBeUndefined();
  });
});
