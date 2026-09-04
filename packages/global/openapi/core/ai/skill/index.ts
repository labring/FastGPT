import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { ChatWorkflowSseResponseSchema } from '../../chat/completion/api';
import {
  ListAppsBySkillIdResponseSchema,
  CreateSkillBodySchema,
  CreateSkillFolderBodySchema,
  CreateSkillFolderResponseSchema,
  CreateSkillResponseSchema,
  DeleteSkillQuerySchema,
  ExportSkillQuerySchema,
  GetSkillDetailQuerySchema,
  GetSkillDetailResponseSchema,
  GetSkillFolderPathQuerySchema,
  GetSkillFolderPathResponseSchema,
  ImportSkillQuerySchema,
  ImportSkillResponseSchema,
  ListAppsBySkillIdQuerySchema,
  ListSkillVersionsBodySchema,
  ListSkillVersionsResponseSchema,
  ListSkillsQuerySchema,
  ListSkillsV2QuerySchema,
  ListSkillsResponseSchema,
  SaveDeploySkillBodySchema,
  SaveDeploySkillResponseSchema,
  SkillDebugChatBodySchema,
  SkillRuntimeBodySchema,
  SkillRuntimeInitEventSchema,
  SwitchSkillVersionBodySchema,
  UpdateSkillBodySchema,
  UpdateSkillVersionBodySchema,
  CopySkillBodySchema,
  CopySkillResponseSchema,
  ResumeSkillInheritPermissionQuerySchema,
  ResumeSkillInheritPermissionResponseSchema,
  ChangeSkillOwnerBodySchema,
  ChangeSkillOwnerResponseSchema,
  GetSkillCollaboratorListQuerySchema,
  GetSkillCollaboratorListResponseSchema,
  UpdateSkillCollaboratorBodySchema,
  UpdateSkillCollaboratorResponseSchema
} from './api';
import { SandboxRuntimeStatusResponseSchema } from '../../../../core/ai/sandbox/type';

export const SkillPath: OpenAPIPath = {
  '/core/ai/skill/list': {
    post: {
      summary: '获取技能列表',
      description: '获取当前团队可见的系统技能或个人技能',
      tags: [DevApiTagsMap.skillBasic],
      requestBody: {
        content: {
          'application/json': {
            schema: ListSkillsQuerySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回技能列表',
          content: {
            'application/json': {
              schema: ListSkillsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/listV2': {
    post: {
      summary: '分页获取技能列表',
      description: '分页获取当前团队可见的系统技能或个人技能',
      tags: [DevApiTagsMap.skillBasic],
      requestBody: {
        content: {
          'application/json': {
            schema: ListSkillsV2QuerySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回分页技能列表',
          content: {
            'application/json': {
              schema: ListSkillsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/detail': {
    get: {
      summary: '获取技能详情',
      description: '根据 skillId 获取技能详情',
      tags: [DevApiTagsMap.skillBasic],
      requestParams: {
        query: GetSkillDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功返回技能详情',
          content: {
            'application/json': {
              schema: GetSkillDetailResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/create': {
    post: {
      summary: '创建技能',
      description: '创建一个新的技能，并初始化空白 skills 工作区',
      tags: [DevApiTagsMap.skillBasic],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateSkillBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建技能',
          content: {
            'application/json': {
              schema: CreateSkillResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/update': {
    post: {
      summary: '更新技能',
      description: '更新技能名称、描述、分类和配置',
      tags: [DevApiTagsMap.skillBasic],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateSkillBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新技能'
        }
      }
    }
  },
  '/core/ai/skill/copy': {
    post: {
      summary: '复制技能',
      description: '复制指定技能、当前版本包和权限信息，并返回新技能 ID',
      tags: [DevApiTagsMap.skillBasic],
      requestBody: {
        content: {
          'application/json': {
            schema: CopySkillBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功复制技能',
          content: {
            'application/json': {
              schema: CopySkillResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/resumeInheritPermission': {
    get: {
      summary: '恢复技能继承权限',
      description: '恢复指定技能或技能文件夹的权限继承',
      tags: [DevApiTagsMap.skillPermission],
      requestParams: {
        query: ResumeSkillInheritPermissionQuerySchema
      },
      responses: {
        200: {
          description: '成功恢复技能继承权限',
          content: {
            'application/json': {
              schema: ResumeSkillInheritPermissionResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/ai/skill/changeOwner': {
    post: {
      summary: '转让技能所有权',
      description: '将技能所有权转让给指定团队成员',
      tags: [DevApiTagsMap.permissionResource, DevApiTagsMap.skillPermission],
      requestBody: {
        content: {
          'application/json': {
            schema: ChangeSkillOwnerBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功转让技能所有权',
          content: {
            'application/json': {
              schema: ChangeSkillOwnerResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/ai/skill/collaborator/list': {
    get: {
      summary: '获取技能协作者列表',
      description: '获取技能协作者列表，包含继承权限场景下的父级协作者信息',
      tags: [DevApiTagsMap.permissionCollaborator, DevApiTagsMap.skillPermission],
      requestParams: {
        query: GetSkillCollaboratorListQuerySchema
      },
      responses: {
        200: {
          description: '成功获取技能协作者列表',
          content: {
            'application/json': {
              schema: GetSkillCollaboratorListResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/ai/skill/collaborator/update': {
    post: {
      summary: '更新技能协作者',
      description: '覆盖更新技能的协作者权限',
      tags: [DevApiTagsMap.permissionCollaborator, DevApiTagsMap.skillPermission],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateSkillCollaboratorBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新技能协作者',
          content: {
            'application/json': {
              schema: UpdateSkillCollaboratorResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/delete': {
    delete: {
      summary: '删除技能',
      description: '根据 skillId 删除技能',
      tags: [DevApiTagsMap.skillBasic],
      requestParams: {
        query: DeleteSkillQuerySchema
      },
      responses: {
        200: {
          description: '成功删除技能'
        }
      }
    }
  },
  '/core/ai/skill/import': {
    post: {
      summary: '导入技能',
      description: '以原始请求体上传 .zip 技能包并导入为技能',
      tags: [DevApiTagsMap.skillBasic],
      requestParams: {
        query: ImportSkillQuerySchema
      },
      requestBody: {
        content: {
          'application/octet-stream': {
            schema: {
              type: 'string',
              format: 'binary',
              description: '技能包原始二进制内容'
            }
          }
        }
      },
      responses: {
        200: {
          description: '成功导入技能',
          content: {
            'application/json': {
              schema: ImportSkillResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/export': {
    get: {
      summary: '导出技能编辑区',
      description: '下载当前技能编辑沙盒工作区 ZIP 包',
      tags: [DevApiTagsMap.skillBasic],
      requestParams: {
        query: ExportSkillQuerySchema
      },
      responses: {
        200: {
          description: '返回技能编辑区 zip 文件',
          content: {
            'application/zip': {
              schema: {
                type: 'string',
                format: 'binary'
              }
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/apps': {
    get: {
      summary: '查询引用技能的应用',
      description: '查询使用指定 skillId 的应用列表',
      tags: [DevApiTagsMap.skillBasic],
      requestParams: {
        query: ListAppsBySkillIdQuerySchema
      },
      responses: {
        200: {
          description: '成功返回引用应用列表',
          content: {
            'application/json': {
              schema: ListAppsBySkillIdResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/folder/create': {
    post: {
      summary: '创建技能文件夹',
      description: '在技能目录树中创建一个文件夹',
      tags: [DevApiTagsMap.skillBasic],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateSkillFolderBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建文件夹',
          content: {
            'application/json': {
              schema: CreateSkillFolderResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/folder/path': {
    get: {
      summary: '获取技能文件夹路径',
      description: '根据当前 skillId 返回目录路径',
      tags: [DevApiTagsMap.skillBasic],
      requestParams: {
        query: GetSkillFolderPathQuerySchema
      },
      responses: {
        200: {
          description: '成功返回目录路径',
          content: {
            'application/json': {
              schema: GetSkillFolderPathResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/runtime/getStatus': {
    post: {
      summary: '获取技能编辑沙盒 runtime 状态',
      description: '检查 Skill Edit runtime 是否可直接初始化、需要升级或正在升级',
      tags: [DevApiTagsMap.skillEdit],
      requestBody: {
        content: {
          'application/json': {
            schema: SkillRuntimeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回 runtime 状态',
          content: {
            'application/json': {
              schema: SandboxRuntimeStatusResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/runtime/upgrade': {
    post: {
      summary: '触发技能编辑沙盒 runtime 升级',
      description: '触发旧 runtime 工作区归档，客户端随后通过 getStatus 轮询结果',
      tags: [DevApiTagsMap.skillEdit],
      requestBody: {
        content: {
          'application/json': {
            schema: SkillRuntimeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回触发后的 runtime 状态',
          content: {
            'application/json': {
              schema: SandboxRuntimeStatusResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/runtime/init': {
    post: {
      summary: '初始化技能编辑沙盒 runtime',
      description: '启动、恢复或复用 Skill Edit sandbox，返回 SSE sandboxStatus 事件流',
      tags: [DevApiTagsMap.skillEdit],
      requestBody: {
        content: {
          'application/json': {
            schema: SkillRuntimeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '返回 text/event-stream 事件流',
          content: {
            'text/event-stream': {
              schema: SkillRuntimeInitEventSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/save-deploy': {
    post: {
      summary: '保存并发布技能',
      description: '从 edit-debug 沙盒打包当前技能并创建新版本',
      tags: [DevApiTagsMap.skillEdit],
      requestBody: {
        content: {
          'application/json': {
            schema: SaveDeploySkillBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功保存并发布技能',
          content: {
            'application/json': {
              schema: SaveDeploySkillResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/debugChat': {
    post: {
      summary: '技能调试对话',
      description: '基于 edit-debug 沙盒发起技能调试对话，返回 SSE 流',
      tags: [DevApiTagsMap.skillDebug],
      requestBody: {
        content: {
          'application/json': {
            schema: SkillDebugChatBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '返回 text/event-stream 调试事件流',
          content: {
            'text/event-stream': {
              schema: ChatWorkflowSseResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/ai/skill/debugChat': {
    post: {
      summary: '技能调试对话（Pro）',
      description: '基于 Pro 版 edit-debug 沙盒发起技能调试对话，返回 SSE 流',
      tags: [DevApiTagsMap.skillDebug],
      requestBody: {
        content: {
          'application/json': {
            schema: SkillDebugChatBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '返回 text/event-stream 调试事件流',
          content: {
            'text/event-stream': {
              schema: ChatWorkflowSseResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/version/list': {
    post: {
      summary: '获取技能版本列表',
      description: '分页获取指定技能的版本列表，按创建时间倒序排列',
      tags: [DevApiTagsMap.skillVersion],
      requestBody: {
        content: {
          'application/json': {
            schema: ListSkillVersionsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回版本列表',
          content: {
            'application/json': {
              schema: ListSkillVersionsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/ai/skill/version/update': {
    post: {
      summary: '更新技能版本名称',
      description: '更新指定技能版本的名称',
      tags: [DevApiTagsMap.skillVersion],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateSkillVersionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新版本名称'
        }
      }
    }
  },
  '/core/ai/skill/version/switch': {
    post: {
      summary: '切换技能当前版本',
      description: '将 skill 主表的当前版本指向指定版本',
      tags: [DevApiTagsMap.skillVersion],
      requestBody: {
        content: {
          'application/json': {
            schema: SwitchSkillVersionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功切换当前版本'
        }
      }
    }
  }
};
