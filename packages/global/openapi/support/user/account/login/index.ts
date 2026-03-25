import type { OpenAPIPath } from '../../../../type';
import { TagsMap } from '../../../../tag';
import {
  LoginByPasswordBodySchema,
  PreLoginQuerySchema,
  PreLoginResponseSchema,
  OauthLoginBodySchema,
  FastLoginBodySchema,
  WxLoginBodySchema,
  GetWXLoginQRResponseSchema,
  LoginSuccessResponseSchema
} from './api';
import { UserSchema } from '../../../../../support/user/type';

export const LoginPath: OpenAPIPath = {
  '/support/user/account/tokenLogin': {
    get: {
      summary: 'Token 登录',
      description: '通过已有的登录令牌获取用户信息',
      tags: [TagsMap.userLogin],
      responses: {
        200: {
          description: '成功获取用户信息',
          content: {
            'application/json': {
              schema: UserSchema
            }
          }
        }
      }
    }
  },
  '/support/user/account/preLogin': {
    get: {
      summary: '预登录获取验证码',
      description: '通过用户名获取预登录验证码，用于密码登录时的验证',
      tags: [TagsMap.userLogin],
      requestParams: {
        query: PreLoginQuerySchema
      },
      responses: {
        200: {
          description: '成功获取预登录验证码',
          content: {
            'application/json': {
              schema: PreLoginResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/user/account/loginByPassword': {
    post: {
      summary: '用户密码登录',
      description: '通过用户名和密码进行登录，需要先获取预登录验证码',
      tags: [TagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: LoginByPasswordBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '登录成功，返回用户信息和令牌',
          content: {
            'application/json': {
              schema: LoginSuccessResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/account/login/oauth': {
    post: {
      summary: 'OAuth 登录',
      description: '使用第三方 OAuth 授权登录',
      tags: [TagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: OauthLoginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '登录成功',
          content: {
            'application/json': {
              schema: LoginSuccessResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/account/login/fastLogin': {
    post: {
      summary: '快捷登录',
      description: '使用 Token 和 Code 进行快捷登录',
      tags: [TagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: FastLoginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '登录成功',
          content: {
            'application/json': {
              schema: LoginSuccessResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/account/login/wx/getQR': {
    get: {
      summary: '获取微信登录二维码',
      description: '获取微信登录二维码',
      tags: [TagsMap.userLogin],
      responses: {
        200: {
          description: '获取微信登录二维码成功',
          content: {
            'application/json': {
              schema: GetWXLoginQRResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/account/login/wx/getResult': {
    post: {
      summary: '获取微信登录结果',
      description: '提交微信登录 Code 以获取登录结果',
      tags: [TagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: WxLoginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '登录成功',
          content: {
            'application/json': {
              schema: LoginSuccessResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/user/account/loginout': {
    get: {
      summary: '退出登录',
      description: '退出当前用户的所有会话并清除登录凭证',
      tags: [TagsMap.userLogin],
      responses: {
        200: {
          description: '退出登录成功'
        }
      }
    }
  }
};
