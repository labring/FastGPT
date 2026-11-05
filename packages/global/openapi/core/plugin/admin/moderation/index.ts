import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  DeleteModerationPluginBodySchema,
  RestoreModerationPluginBodySchema,
  GetModerationPluginListQuerySchema,
  GetModerationPluginListResponseSchema,
  GetModerationPolicyResponseSchema,
  RawModerationCheckBodySchema,
  RawModerationCheckResponseSchema,
  SaveModerationConfigBodySchema,
  SaveModerationConfigResponseSchema,
  UpdateModerationPolicyBodySchema,
  UpdateModerationPolicyResponseSchema,
  GetModerationRecordsBodySchema,
  GetModerationRecordsResponseSchema
} from './api';

export const AdminPluginModerationPath: OpenAPIPath = {
  '/core/plugin/admin/moderation/restore': {
    post: {
      summary: '恢复已卸载的内容审核插件',
      description: '保留原配置并恢复展示，不自动启用审核',
      tags: [DevApiTagsMap.pluginAdmin],
      requestBody: {
        required: true,
        content: { 'application/json': { schema: RestoreModerationPluginBodySchema } }
      },
      responses: { 200: { description: '恢复成功' } }
    }
  },
  '/core/plugin/admin/moderation/list': {
    get: {
      summary: '获取内容审查插件列表',
      description: '返回已安装的审查插件与本地配置合并后的列表，需要系统管理员权限',
      tags: [DevApiTagsMap.pluginAdmin],
      requestParams: {
        query: GetModerationPluginListQuerySchema
      },
      responses: {
        200: {
          description: '成功获取列表',
          content: {
            'application/json': {
              schema: GetModerationPluginListResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/plugin/admin/moderation/config': {
    post: {
      summary: '保存内容审查插件配置',
      description: '保存插件凭据与启用状态。启用是全局互斥的：启用一个插件会同时停用其他审查插件',
      tags: [DevApiTagsMap.pluginAdmin],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: SaveModerationConfigBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功保存配置',
          content: {
            'application/json': {
              schema: SaveModerationConfigResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/plugin/admin/moderation/check': {
    post: {
      summary: '测试调用内容审查插件',
      description: '对待审文本执行一次同步审查，直接返回标准审查结构',
      tags: [DevApiTagsMap.pluginAdmin],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: RawModerationCheckBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '审查完成，返回 verdict 与逐项命中明细',
          content: {
            'application/json': {
              schema: RawModerationCheckResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/plugin/admin/moderation/delete': {
    post: {
      summary: '删除内容审查插件',
      description: '禁用 Plugin Server 系统安装并保留本地配置供恢复。已启用的插件需先停用',
      tags: [DevApiTagsMap.pluginAdmin],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: DeleteModerationPluginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功删除'
        }
      }
    }
  },

  '/core/plugin/admin/moderation/policy': {
    get: {
      summary: '获取全局内容审核策略',
      description:
        '获取当前全局内容审核策略配置（生效环节、处理策略、开启状态等），需要系统管理员权限',
      tags: [DevApiTagsMap.pluginAdmin],
      responses: {
        200: {
          description: '成功获取全局策略',
          content: {
            'application/json': {
              schema: GetModerationPolicyResponseSchema
            }
          }
        }
      }
    },
    post: {
      summary: '更新全局内容审核策略',
      description:
        '更新全局内容审核策略配置（生效环节、处理策略、开启状态与生效插件等），需要系统管理员权限',
      tags: [DevApiTagsMap.pluginAdmin],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: UpdateModerationPolicyBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功保存全局策略',
          content: {
            'application/json': {
              schema: UpdateModerationPolicyResponseSchema
            }
          }
        }
      }
    }
  },

  '/core/plugin/admin/moderation/records': {
    post: {
      summary: '分页查询内容审核记录',
      description: '分页查询系统内容审查持久化审计记录，支持按环节和裁决过滤。需要系统管理员权限',
      tags: [DevApiTagsMap.pluginAdmin],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: GetModerationRecordsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取记录列表',
          content: {
            'application/json': {
              schema: GetModerationRecordsResponseSchema
            }
          }
        }
      }
    }
  }
};
