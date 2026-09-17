import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  LoginByPasswordBodySchema,
  PreLoginQuerySchema,
  PreLoginResponseSchema,
  OauthLoginBodySchema,
  FastLoginBodySchema,
  WxLoginBodySchema,
  GetWXLoginQRResponseSchema,
  LoginSuccessResponseSchema,
  LoginByPasswordResponseSchema,
  LoginVerificationChallengeBodySchema,
  LoginVerificationCaptchaResponseSchema,
  LoginVerificationSendCodeBodySchema,
  LoginVerificationSendCodeResponseSchema,
  LoginVerificationVerifyBodySchema,
  WxLoginResultResponseSchema,
  OpenAPIUserSchema,
  SsoGetAuthorizationURLBodySchema,
  SsoGetAuthorizationURLResponseSchema,
  WecomGetRedirectURLBodySchema,
  WecomGetRedirectURLResponseSchema
} from './api';

export const LoginPath: OpenAPIPath = {
  '/support/user/account/tokenLogin': {
    get: {
      summary: 'Token 登录',
      description: '通过已有的登录令牌获取用户信息',
      tags: [DevApiTagsMap.userLogin],
      responses: {
        200: {
          description: '成功获取用户信息',
          content: {
            'application/json': {
              schema: OpenAPIUserSchema
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
      tags: [DevApiTagsMap.userLogin],
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
      tags: [DevApiTagsMap.userLogin],
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
              schema: LoginByPasswordResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/user/account/login/verification/captcha': {
    post: {
      summary: '获取登录二次验证图片验证码',
      description: '使用登录 Challenge 获取图片验证码，验证码答案用于发送邮箱或短信验证码',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: LoginVerificationChallengeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取图片验证码',
          content: {
            'application/json': {
              schema: LoginVerificationCaptchaResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/user/account/login/verification/sendCode': {
    post: {
      summary: '发送登录二次验证码',
      description: '校验图片验证码后向登录账号的邮箱或手机号发送验证码',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: LoginVerificationSendCodeBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功发送登录二次验证码',
          content: {
            'application/json': {
              schema: LoginVerificationSendCodeResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/user/account/login/verification/verify': {
    post: {
      summary: '验证登录二次验证码',
      description: '校验登录 Challenge 和邮箱或短信验证码并完成密码登录',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: LoginVerificationVerifyBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '验证成功并完成登录',
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
      tags: [DevApiTagsMap.userLogin],
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
  '/proApi/support/user/account/login/getAuthURL': {
    post: {
      summary: '获取 SSO 授权地址',
      description: '根据当前登录回调地址生成 SSO 授权跳转地址',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: SsoGetAuthorizationURLBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功生成 SSO 授权地址',
          content: {
            'application/json': {
              schema: SsoGetAuthorizationURLResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/support/user/account/login/wecom/getRedirectUrl': {
    post: {
      summary: '获取企业微信登录跳转地址',
      description: '根据登录回调地址和当前终端环境生成企业微信 OAuth 跳转地址',
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: WecomGetRedirectURLBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功生成企业微信登录跳转地址',
          content: {
            'application/json': {
              schema: WecomGetRedirectURLResponseSchema
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
      tags: [DevApiTagsMap.userLogin],
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
      tags: [DevApiTagsMap.userLogin],
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
      tags: [DevApiTagsMap.userLogin],
      requestBody: {
        content: {
          'application/json': {
            schema: WxLoginBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '登录成功或二维码已过期',
          content: {
            'application/json': {
              schema: WxLoginResultResponseSchema
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
      tags: [DevApiTagsMap.userLogin],
      responses: {
        200: {
          description: '退出登录成功'
        }
      }
    },
    post: {
      summary: '退出登录',
      description: '退出当前用户的所有会话并清除登录凭证（管理端兼容调用）',
      tags: [DevApiTagsMap.userLogin],
      responses: {
        200: {
          description: '退出登录成功'
        }
      }
    }
  }
};
