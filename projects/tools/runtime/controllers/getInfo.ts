import type { Request, Response } from 'express';
import { z } from 'zod';
import { getTool } from '../utils/tools';

const props = z.object({
  toolId: z.string()
});

export async function getInfo(req: Request, res: Response) {
  const { toolId } = props.parse(req.query);
  const tool = getTool(toolId);
  res.json({
    ...tool,
    cb: undefined
  });
}
