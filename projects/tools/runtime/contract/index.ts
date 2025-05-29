import type { ToolType } from '../../type';
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();
export const contract = c.router({
  run: {
    path: '/run',
    method: 'POST',
    description: 'Run a tool',
    body: z.object({
      toolId: z.string(),
      inputs: z.object({})
    }),
    responses: {
      200: z.object({
        output: z.any()
      }),
      400: z.object({
        error: z.string()
      }),
      404: z.object({
        error: z.string()
      })
    }
  },
  list: {
    path: '/list',
    method: 'GET',
    description: 'Get tools list',
    responses: {
      200: c.type<ToolType[]>()
    }
  },
  flushId: {
    path: '/flushId',
    method: 'GET',
    description: 'Get flushId',
    responses: {
      200: z.string()
    }
  }
});
