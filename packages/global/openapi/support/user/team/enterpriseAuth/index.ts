import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  GetEnterpriseAuthBanksResponseSchema,
  GetEnterpriseAuthCurrentTaskDetailResponseSchema,
  GetEnterpriseAuthStatusResponseSchema,
  ResetEnterpriseAuthResponseSchema,
  StartEnterpriseAuthBodySchema,
  StartEnterpriseAuthResponseSchema,
  VerifyEnterpriseAuthAmountBodySchema,
  VerifyEnterpriseAuthAmountResponseSchema
} from './api';

export const EnterpriseAuthPath: OpenAPIPath = {
  '/proApi/support/user/team/enterpriseAuth/status': {
    get: {
      summary: '获取企业认证状态',
      tags: [DevApiTagsMap.teamManage],
      responses: {
        200: {
          description: '企业认证状态',
          content: {
            'application/json': {
              schema: GetEnterpriseAuthStatusResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/enterpriseAuth/currentTaskDetail': {
    get: {
      summary: '获取当前企业认证任务详情',
      tags: [DevApiTagsMap.teamManage],
      responses: {
        200: {
          description: '当前待金额验证任务详情',
          content: {
            'application/json': {
              schema: GetEnterpriseAuthCurrentTaskDetailResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/enterpriseAuth/banks': {
    get: {
      summary: '获取企业认证银行列表',
      tags: [DevApiTagsMap.teamManage],
      responses: {
        200: {
          description: '银行编码到总行名称映射',
          content: {
            'application/json': {
              schema: GetEnterpriseAuthBanksResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/enterpriseAuth/start': {
    post: {
      summary: '发起企业认证',
      tags: [DevApiTagsMap.teamManage],
      requestBody: {
        content: {
          'application/json': {
            schema: StartEnterpriseAuthBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '企业认证任务状态',
          content: {
            'application/json': {
              schema: StartEnterpriseAuthResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/enterpriseAuth/verifyAmount': {
    post: {
      summary: '验证企业认证打款金额',
      tags: [DevApiTagsMap.teamManage],
      requestBody: {
        content: {
          'application/json': {
            schema: VerifyEnterpriseAuthAmountBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '金额验证结果',
          content: {
            'application/json': {
              schema: VerifyEnterpriseAuthAmountResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/team/enterpriseAuth/reset': {
    post: {
      summary: '取消当前企业认证任务并重新填写',
      tags: [DevApiTagsMap.teamManage],
      responses: {
        200: {
          description: '取消成功',
          content: {
            'application/json': {
              schema: ResetEnterpriseAuthResponseSchema
            }
          }
        }
      }
    }
  }
};
