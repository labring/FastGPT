import { GET, PUT } from '@/web/common/api/request';
import type {
  putUpdateGateConfigCopyRightData,
  putUpdateGateConfigCopyRightResponse,
  putUpdateGateConfigData,
  putUpdateGateConfigResponse
} from '@fastgpt/global/support/user/team/gate/api.d';
import type { GateSchemaType } from '@fastgpt/global/support/user/team/gate/type';

/**
 * 获取门户配置 - Get请求
 */
export const getTeamGateConfig = () => {
  return GET<GateSchemaType>('/proApi/support/user/team/gate/config/list');
};

/**
 * 创建/更新团队门户配置 - 主页配置
 */
export const updateTeamGateConfig = (data: putUpdateGateConfigData) => {
  return PUT<putUpdateGateConfigResponse>('/proApi/support/user/team/gate/config/update', data);
};

/**
 * 更新团队门户配置的版权信息
 */
export const updateTeamGateConfigCopyRight = (data: putUpdateGateConfigCopyRightData) => {
  return PUT<putUpdateGateConfigCopyRightResponse>(
    '/proApi/support/user/team/gate/config/copyright/update',
    data
  );
};

/**
 * 获取团队门户配置的版权信息
 */
export const getTeamGateConfigCopyRight = () => {
  return GET<putUpdateGateConfigCopyRightResponse>(
    '/proApi/support/user/team/gate/config/copyright/list'
  );
};
