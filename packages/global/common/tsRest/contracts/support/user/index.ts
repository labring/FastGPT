import { c } from '../../../init';

export const userContract = c.router({
  logout: {
    method: 'GET',
    path: '/support/user/account/loginout',
    responses: {
      200: c.type<void>()
    },
    summary: '退出登录'
  }
});
