import type { OpenAPIPath } from '../../../type';
import {
  ListModelDeprecationInformFailuresBodySchema,
  ListModelDeprecationInformFailuresResponseSchema,
  ModelDeprecationInformRunBodySchema,
  ModelDeprecationInformRunResponseSchema,
  RetryModelDeprecationInformRunResponseSchema,
  TerminateModelDeprecationInformPlanBodySchema,
  TerminateModelDeprecationInformPlanResponseSchema,
  CreateModelDeprecationInformBodySchema,
  CreateModelDeprecationInformResponseSchema,
  ListModelDeprecationInformQuerySchema,
  ListModelDeprecationInformResponseSchema,
  SendSystemInformBodySchema,
  UpdateSystemModalBodySchema,
  UpdateOperationalAdBodySchema,
  UpdateActivityAdBodySchema,
  SystemMsgModalResponseSchema,
  OperationalAdResponseSchema,
  ActivityAdResponseSchema
} from './api';
import { DevApiTagsMap } from '../../../tag';

export const AdminInformPath: OpenAPIPath = {
  '/proApi/admin/system/inform/modelDeprecation/failures': {
    post: {
      summary: '查询模型下架通知失败记录',
      description: '按计划和轮次分页查询失败记录，不包含联系方式或消息正文',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: { 'application/json': { schema: ListModelDeprecationInformFailuresBodySchema } }
      },
      responses: {
        200: {
          description: '操作成功',
          content: {
            'application/json': { schema: ListModelDeprecationInformFailuresResponseSchema }
          }
        }
      }
    }
  },
  '/proApi/admin/system/inform/modelDeprecation/recover': {
    post: {
      summary: '恢复模型下架通知轮次',
      description: '使用原轮次和游标恢复失败或中断的执行',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: { 'application/json': { schema: ModelDeprecationInformRunBodySchema } }
      },
      responses: {
        200: {
          description: '操作成功',
          content: { 'application/json': { schema: ModelDeprecationInformRunResponseSchema } }
        }
      }
    }
  },
  '/proApi/admin/system/inform/modelDeprecation/retry': {
    post: {
      summary: '重发模型下架通知失败记录',
      description: '为已完成轮次中未解决的失败记录创建独立重发轮次',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: { 'application/json': { schema: ModelDeprecationInformRunBodySchema } }
      },
      responses: {
        200: {
          description: '操作成功',
          content: { 'application/json': { schema: RetryModelDeprecationInformRunResponseSchema } }
        }
      }
    }
  },
  '/proApi/admin/system/inform/modelDeprecation/terminate': {
    post: {
      summary: '终止模型下架通知计划',
      description: '终止未完成轮次并返回状态索引，保留已完成结果',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: { 'application/json': { schema: TerminateModelDeprecationInformPlanBodySchema } }
      },
      responses: {
        200: {
          description: '操作成功',
          content: {
            'application/json': { schema: TerminateModelDeprecationInformPlanResponseSchema }
          }
        }
      }
    }
  },

  '/proApi/admin/system/inform/modelDeprecation/create': {
    post: {
      summary: '创建模型下架通知计划',
      description:
        '接收带 offset 的下架截止时间和发送时间锚点，按锚点时分秒安排多轮提醒；实际下架后停止投递',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateModelDeprecationInformBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建模型下架通知计划',
          content: {
            'application/json': {
              schema: CreateModelDeprecationInformResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/admin/system/inform/modelDeprecation/list': {
    post: {
      summary: '查询模型下架通知历史',
      description: '分页查询模型下架通知计划及各轮发送状态',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: {
          'application/json': {
            schema: ListModelDeprecationInformQuerySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取模型下架通知历史',
          content: {
            'application/json': {
              schema: ListModelDeprecationInformResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/admin/system/inform/sendSystemInform': {
    post: {
      summary: '发送系统通知给所有用户',
      description: '向所有用户发送系统通知消息',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: {
          'application/json': {
            schema: SendSystemInformBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功发送系统通知'
        }
      }
    }
  },
  '/proApi/support/user/inform/getSystemMsgModal': {
    get: {
      summary: '获取系统弹窗内容',
      description: '获取系统消息弹窗的内容',
      tags: [DevApiTagsMap.adminInform],
      responses: {
        200: {
          description: '成功获取系统弹窗内容',
          content: {
            'application/json': {
              schema: SystemMsgModalResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/admin/system/inform/updateSystemModal': {
    post: {
      summary: '更新系统弹窗内容',
      description: '更新系统消息弹窗的内容',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateSystemModalBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新系统弹窗'
        }
      }
    }
  },
  '/proApi/support/user/inform/getOperationalAd': {
    get: {
      summary: '获取运营广告',
      description: '获取运营广告的图片和链接',
      tags: [DevApiTagsMap.adminInform],
      responses: {
        200: {
          description: '成功获取运营广告',
          content: {
            'application/json': {
              schema: OperationalAdResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/admin/system/inform/updateOperationalAd': {
    post: {
      summary: '更新运营广告',
      description: '更新运营广告的图片和链接',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateOperationalAdBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新运营广告'
        }
      }
    }
  },
  '/proApi/support/user/inform/getActivityAd': {
    get: {
      summary: '获取活动广告',
      description: '获取活动广告的图片和链接',
      tags: [DevApiTagsMap.adminInform],
      responses: {
        200: {
          description: '成功获取活动广告',
          content: {
            'application/json': {
              schema: ActivityAdResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/admin/system/inform/updateActivityAd': {
    post: {
      summary: '更新活动广告',
      description: '更新活动广告的图片和链接',
      tags: [DevApiTagsMap.adminInform],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateActivityAdBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新活动广告'
        }
      }
    }
  }
};
