import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  DeleteTeamToolBodySchema,
  GetTeamPluginListResponseSchema,
  GetTeamSystemPluginListQuerySchema,
  GetTeamToolDetailQuerySchema,
  GetTeamToolVersionsQuerySchema,
  GetTeamToolVersionsResponseSchema,
  OpenAPITeamToolDetailSchema
} from './tool/api';
import {
  ConfirmTeamUploadPkgPluginBodySchema,
  InstallTeamPluginFromUrlBodySchema,
  TeamPkgEmptyResponseSchema,
  UploadTeamPkgPluginBodySchema,
  UploadTeamPkgPluginResponseSchema
} from './pkg/api';
import { TeamPluginEmptyResponseSchema } from './common';

export const PluginTeamPath: OpenAPIPath = {
  '/core/plugin/team/tool/list': {
    get: {
      summary: '获取团队插件列表',
      description: '获取团队插件列表',
      tags: [DevApiTagsMap.pluginTeam],
      requestParams: {
        query: GetTeamSystemPluginListQuerySchema
      },
      responses: {
        200: {
          description: '获取团队插件列表成功',
          content: {
            'application/json': {
              schema: GetTeamPluginListResponseSchema
            }
          }
        }
      }
    }
  },
  // Tool
  '/core/plugin/team/tool/detail': {
    get: {
      summary: '获取工具卡片详情',
      description: '获取工具片详情',
      tags: [DevApiTagsMap.pluginTeam],
      requestParams: {
        query: GetTeamToolDetailQuerySchema
      },
      responses: {
        200: {
          description: '获取工具卡片详情成功',
          content: {
            'application/json': {
              schema: OpenAPITeamToolDetailSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/tool/versions': {
    get: {
      summary: '获取团队工具版本列表',
      description: '获取团队工具版本列表',
      tags: [DevApiTagsMap.pluginTeam],
      requestParams: {
        query: GetTeamToolVersionsQuerySchema
      },
      responses: {
        200: {
          description: '获取团队工具版本列表成功',
          content: {
            'application/json': {
              schema: GetTeamToolVersionsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/tool/delete': {
    post: {
      summary: '删除团队插件',
      description: '删除当前团队 source 下的插件包，并把团队账本收敛为 deleted',
      tags: [DevApiTagsMap.pluginTeam],
      requestBody: {
        content: {
          'application/json': {
            schema: DeleteTeamToolBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '删除团队插件成功',
          content: {
            'application/json': {
              schema: TeamPluginEmptyResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/pkg/upload': {
    post: {
      summary: '上传团队插件包',
      description: '上传 .pkg 或包含多个 .pkg 的 .zip 文件，需要团队插件管理权限',
      tags: [DevApiTagsMap.pluginTeam],
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: UploadTeamPkgPluginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功上传并解析团队插件包',
          content: {
            'application/json': {
              schema: UploadTeamPkgPluginResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/pkg/confirm': {
    post: {
      summary: '确认团队上传插件安装',
      description: '确认上传解析结果，把插件安装到当前团队 source 并写入团队账本',
      tags: [DevApiTagsMap.pluginTeam],
      requestBody: {
        content: {
          'application/json': {
            schema: ConfirmTeamUploadPkgPluginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '确认团队上传插件安装成功',
          content: {
            'application/json': {
              schema: TeamPkgEmptyResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/pkg/installWithUrl': {
    post: {
      summary: '从 URL 安装团队插件',
      description: '从 Marketplace 下载 URL 安装插件到当前团队 source，并写入团队账本',
      tags: [DevApiTagsMap.pluginTeam],
      requestBody: {
        content: {
          'application/json': {
            schema: InstallTeamPluginFromUrlBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '从 URL 安装团队插件成功',
          content: {
            'application/json': {
              schema: TeamPkgEmptyResponseSchema
            }
          }
        }
      }
    }
  }
};
