import { describe, expect, it } from 'vitest';

import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import { getIsMemberSyncMode, getRegisterMethods } from '@/web/common/system/utils';

const createFeConfigs = (overrides: Partial<FastGPTFeConfigsType>): FastGPTFeConfigsType => ({
  uploadFileMaxAmount: 10,
  uploadFileMaxSize: 100,
  ...overrides
});

describe('system fe config utils', () => {
  it('filters legacy sync from register methods', () => {
    expect(getRegisterMethods(createFeConfigs({ register_method: ['sync'] }))).toEqual([]);
    expect(
      getRegisterMethods(createFeConfigs({ register_method: ['email', 'sync', 'phone'] }))
    ).toEqual(['email', 'phone']);
  });

  it('detects member sync mode from new teamMode and legacy register_method', () => {
    expect(getIsMemberSyncMode(createFeConfigs({ teamMode: 'sync', register_method: [] }))).toBe(
      true
    );
    expect(getIsMemberSyncMode(createFeConfigs({ register_method: ['sync'] }))).toBe(true);
    expect(
      getIsMemberSyncMode(createFeConfigs({ teamMode: 'single', register_method: ['sync'] }))
    ).toBe(false);
    expect(
      getIsMemberSyncMode(createFeConfigs({ teamMode: 'multi', register_method: ['sync'] }))
    ).toBe(false);
    expect(
      getIsMemberSyncMode(createFeConfigs({ teamMode: 'multi', register_method: ['phone'] }))
    ).toBe(false);
    expect(getIsMemberSyncMode(createFeConfigs({ teamMode: 'single', register_method: [] }))).toBe(
      false
    );
  });
});
