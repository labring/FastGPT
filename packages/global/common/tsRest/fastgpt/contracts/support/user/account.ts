import { initContract } from '@ts-rest/core';
import z from 'zod';
const c = initContract();

export const accountContract = c.router({
  logout: {
    path: '/support/user/account/login',
    method: 'POST',
    body: z.undefined(),
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
