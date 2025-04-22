import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import {
  getGateConfigParams,
  postCreateGateConfigData,
  putUpdateGateHomeConfigData,
  putUpdateGateCopyrightConfigData
} from '@fastgpt/global/support/user/team/gate/api';
import { GateSchemaType } from '@fastgpt/global/support/user/team/gate/type';

/**
 * 获取团队门户配置
 */
export const getTeamGateConfig = (teamId: string) => {
  const params: getGateConfigParams = { teamId };
  return GET<GateSchemaType>(`/proApi/support/user/team/gate/config`, { params });
};

/**
 * 创建/更新团队门户配置
 */
export const createTeamGateConfig = (data: postCreateGateConfigData) => {
  return POST<GateSchemaType>('/proApi/support/user/team/gate/config', data);
};

/**
 * 更新团队门户首页配置
 */
export const updateTeamGateHomeConfig = (
  teamId: string,
  data: Omit<putUpdateGateHomeConfigData, 'teamId'>
) => {
  const requestData: putUpdateGateHomeConfigData = { teamId, ...data };
  return PUT<GateSchemaType>('/proApi/support/user/team/gate/home/config', requestData);
};

/**
 * 更新团队门户版权配置
 */
export const updateTeamGateCopyrightConfig = (
  teamId: string,
  data: Omit<putUpdateGateCopyrightConfigData, 'teamId'>
) => {
  const requestData: putUpdateGateCopyrightConfigData = { teamId, ...data };
  return PUT<GateSchemaType>('/proApi/support/user/team/gate/copyright/config', requestData);
};
