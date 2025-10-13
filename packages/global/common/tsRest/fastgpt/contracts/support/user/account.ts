import { initContract } from '@ts-rest/core';
import z from 'zod';
const c = initContract();

export const accountContract = c.router({
  loginout: {
    path: '/support/user/account/loginout',
    method: 'GET',
    responses: {
      200: z.void()
    },
    metadata: {
      tags: ['support']
    },
    description: '退出登录',
    summary: '退出登录'
  }
});
