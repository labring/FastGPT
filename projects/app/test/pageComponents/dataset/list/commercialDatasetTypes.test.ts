import { describe, expect, it } from 'vitest';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  commercialDatasetTypes,
  isCommercialDatasetType,
  resolveDatasetCreateAction
} from '@/pageComponents/dataset/list/commercialDatasetTypes';
import type { CreateDatasetType } from '@/pageComponents/dataset/list/CreateModal';

const expectedCommercialTypes: CreateDatasetType[] = [
  DatasetTypeEnum.websiteDataset,
  DatasetTypeEnum.apiDataset,
  DatasetTypeEnum.feishu,
  DatasetTypeEnum.yuque,
  DatasetTypeEnum.dingtalk
];

describe('commercialDatasetTypes', () => {
  it('should include all commercial-only dataset create types', () => {
    expect([...commercialDatasetTypes]).toEqual(expectedCommercialTypes);
  });
});

describe('isCommercialDatasetType', () => {
  it.each(expectedCommercialTypes)('should mark %s as commercial-only', (type) => {
    expect(isCommercialDatasetType(type)).toBe(true);
  });

  it('should not mark normal dataset as commercial-only', () => {
    expect(isCommercialDatasetType(DatasetTypeEnum.dataset)).toBe(false);
  });
});

describe('resolveDatasetCreateAction', () => {
  it.each(expectedCommercialTypes)(
    'should open ProModal for %s when team is not commercial edition',
    (type) => {
      expect(resolveDatasetCreateAction(type, false)).toBe('proModal');
    }
  );

  it.each(expectedCommercialTypes)(
    'should treat missing commercial edition flag as community edition for %s',
    (type) => {
      expect(resolveDatasetCreateAction(type, undefined)).toBe('proModal');
    }
  );

  it.each(expectedCommercialTypes)(
    'should allow creating %s when team is commercial edition',
    (type) => {
      expect(resolveDatasetCreateAction(type, true)).toBe('create');
    }
  );

  it('should always allow creating normal dataset', () => {
    expect(resolveDatasetCreateAction(DatasetTypeEnum.dataset, false)).toBe('create');
    expect(resolveDatasetCreateAction(DatasetTypeEnum.dataset, true)).toBe('create');
    expect(resolveDatasetCreateAction(DatasetTypeEnum.dataset, undefined)).toBe('create');
  });
});
