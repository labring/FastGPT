import { afterEach, describe, expect, it } from 'vitest';
import {
  isDisableSuperAdmin,
  isSuperAdminBypassDisabled
} from '@fastgpt/service/support/permission/dataset/disableSuperAdmin';
import { setDisableApiDatasetSuperAdmin } from '@test/utils/serviceEnv';

const apiDatasetServer = { apiServer: { baseUrl: 'https://api.example.com' } };

afterEach(() => {
  setDisableApiDatasetSuperAdmin(false);
});

describe('isDisableSuperAdmin', () => {
  it('开关关闭时全部保留超管旁路', () => {
    expect(isSuperAdminBypassDisabled()).toBe(false);
    expect(isDisableSuperAdmin(apiDatasetServer)).toBe(false);
    expect(isDisableSuperAdmin()).toBe(false);
  });

  it('开关打开后只对配置了 apiDatasetServer 的 API 文件库生效', () => {
    setDisableApiDatasetSuperAdmin(true);
    expect(isSuperAdminBypassDisabled()).toBe(true);
    expect(isDisableSuperAdmin(apiDatasetServer)).toBe(true);
    // 普通知识库没有 apiDatasetServer，部署开关不收紧它们的超管旁路
    expect(isDisableSuperAdmin()).toBe(false);
  });
});
