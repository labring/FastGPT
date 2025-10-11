import { c } from '../../../../../init';

export const accountContract = c.router({
  logout: {
    path: '/support/user/account/login',
    method: 'POST',
    body: c.type<undefined>(),
    responses: {
      200: c.type<void>()
    },
    metadata: {
      tags: ['support']
    },
    description: '退出登录',
    summary: '退出登录'
  }
});
