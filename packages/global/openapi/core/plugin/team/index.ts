import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  DeleteTeamToolBodySchema,
  GetTeamPluginListResponseSchema,
  HideTeamSystemToolBodySchema,
  GetTeamToolDetailQuerySchema,
  GetTeamToolVersionsQuerySchema,
  GetTeamToolVersionsResponseSchema,
  OpenAPITeamToolDetailSchema,
  UpdateTeamToolTagsBodySchema
} from './tool/api';
import {
  CreateTeamPluginTagBodySchema,
  DeleteTeamPluginTagQuerySchema,
  ListTeamPluginTagsResponseSchema,
  TeamPluginTagItemSchema,
  UpdateTeamPluginTagBodySchema,
  UpdateTeamPluginTagOrderBodySchema
} from './tag/api';
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
  '/core/plugin/team/tool/hide': {
    post: {
      summary: '隐藏或取消隐藏系统插件',
      description: '团队隐藏系统预装插件，仅影响新增入口，不影响已有工作流运行',
      tags: [DevApiTagsMap.pluginTeam],
      requestBody: {
        content: {
          'application/json': {
            schema: HideTeamSystemToolBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新团队系统插件隐藏状态成功',
          content: {
            'application/json': {
              schema: TeamPluginEmptyResponseSchema
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
  '/core/plugin/team/tool/tag/update': {
    put: {
      summary: '更新团队插件标签绑定',
      description: '给系统插件或团队安装插件绑定团队自定义标签',
      tags: [DevApiTagsMap.pluginTeam],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTeamToolTagsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新团队插件标签绑定成功',
          content: {
            'application/json': {
              schema: TeamPluginEmptyResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/tag/list': {
    get: {
      summary: '获取团队插件标签',
      description: '获取当前团队的插件自定义标签列表',
      tags: [DevApiTagsMap.pluginTeam],
      responses: {
        200: {
          description: '获取团队插件标签成功',
          content: {
            'application/json': {
              schema: ListTeamPluginTagsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/tag/create': {
    post: {
      summary: '创建团队插件标签',
      description: '创建当前团队的插件自定义标签',
      tags: [DevApiTagsMap.pluginTeam],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateTeamPluginTagBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '创建团队插件标签成功',
          content: {
            'application/json': {
              schema: TeamPluginTagItemSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/tag/update': {
    put: {
      summary: '更新团队插件标签',
      description: '重命名当前团队的插件自定义标签',
      tags: [DevApiTagsMap.pluginTeam],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTeamPluginTagBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新团队插件标签成功',
          content: {
            'application/json': {
              schema: TeamPluginTagItemSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/tag/updateOrder': {
    put: {
      summary: '更新团队插件标签排序',
      description: '更新当前团队的插件自定义标签排序',
      tags: [DevApiTagsMap.pluginTeam],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateTeamPluginTagOrderBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '更新团队插件标签排序成功',
          content: {
            'application/json': {
              schema: TeamPluginEmptyResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/plugin/team/tag/delete': {
    delete: {
      summary: '删除团队插件标签',
      description: '删除团队插件标签，并从插件账本中移除引用',
      tags: [DevApiTagsMap.pluginTeam],
      requestParams: {
        query: DeleteTeamPluginTagQuerySchema
      },
      responses: {
        200: {
          description: '删除团队插件标签成功',
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
