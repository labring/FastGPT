import { serviceEnv } from '@fastgpt/service/env';

/** 测试内切换「API 文件库超管旁路」部署开关；afterEach 里传 false 复位。 */
export const setDisableApiDatasetSuperAdmin = (value: boolean) => {
  Reflect.set(serviceEnv, 'DISABLE_APIDATASET_SUPER_ADMIN', value);
};
