import type { OpenAPIPath } from '../../type';
import {
  CreateCustomDomainBodySchema,
  CreateCustomDomainResponseSchema,
  CustomDomainListResponseSchema,
  DeleteCustomDomainQuerySchema,
  DeleteCustomDomainResponseSchema,
  CheckDNSResolveBodySchema,
  CheckDNSResolveResponseSchema,
  ActiveCustomDomainBodySchema,
  ActiveCustomDomainResponseSchema,
  UpdateDomainVerifyFileBodySchema,
  UpdateDomainVerifyFileResponseSchema
} from './api';
import { TagsMap } from '../../tag';

export const CustomDomainPath: OpenAPIPath = {
  '/proApi/support/customDomain/create': {
    post: {
      summary: '创建自定义域名',
      description:
        '创建一个新的自定义域名配置，需要高级套餐权限。创建后域名会自动部署到 K8s 集群中',
      tags: [TagsMap.customDomain],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateCustomDomainBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建自定义域名',
          content: {
            'application/json': {
              schema: CreateCustomDomainResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/customDomain/list': {
    get: {
      summary: '获取自定义域名列表',
      description: '获取当前团队的所有自定义域名配置列表',
      tags: [TagsMap.customDomain],
      responses: {
        200: {
          description: '成功获取自定义域名列表',
          content: {
            'application/json': {
              schema: CustomDomainListResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/customDomain/delete': {
    delete: {
      summary: '删除自定义域名',
      description: '删除指定的自定义域名配置，同时会从 K8s 集群中移除相关资源',
      tags: [TagsMap.customDomain],
      requestParams: {
        query: DeleteCustomDomainQuerySchema
      },
      responses: {
        200: {
          description: '成功删除自定义域名',
          content: {
            'application/json': {
              schema: DeleteCustomDomainResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/customDomain/checkDNSResolve': {
    post: {
      summary: '检查 DNS 解析',
      description: '检查自定义域名的 CNAME 记录是否正确配置和解析',
      tags: [TagsMap.customDomain],
      requestBody: {
        content: {
          'application/json': {
            schema: CheckDNSResolveBodySchema
          }
        }
      },
      responses: {
        200: {
          description: 'DNS 解析检查结果',
          content: {
            'application/json': {
              schema: CheckDNSResolveResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/customDomain/active': {
    post: {
      summary: '激活自定义域名',
      description: '将自定义域名状态设置为激活，并重新部署到 K8s 集群',
      tags: [TagsMap.customDomain],
      requestBody: {
        content: {
          'application/json': {
            schema: ActiveCustomDomainBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功激活自定义域名',
          content: {
            'application/json': {
              schema: ActiveCustomDomainResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/customDomain/updateVerifyFile': {
    post: {
      summary: '更新域名验证文件',
      description:
        '更新域名验证文件配置，用于 SSL 证书验证。更新后会在 K8s 中创建或更新对应的 Ingress',
      tags: [TagsMap.customDomain],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateDomainVerifyFileBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新域名验证文件',
          content: {
            'application/json': {
              schema: UpdateDomainVerifyFileResponseSchema
            }
          }
        }
      }
    }
  }
};
