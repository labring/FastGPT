import type { Request, Response } from 'express';
import { z } from 'zod';
import { getTool } from '../utils/tools';
import { prod } from '..';
import { dispatch } from '../worker';

export const runType = z.object({
  toolId: z.string(),
  input: z.record(z.string())
});

export async function run(req: Request<0, 0, z.infer<typeof runType>>, res: Response) {
  const { toolId, input } = runType.parse(req.body);
  const tool = getTool(toolId);
  if (!tool) {
    res.status(404).json({ error: 'tool not found' });
    return;
  }
  if (prod) {
    const result = await dispatch({ toolId, input });
    res.json(result);
    return;
  }
  res.json(await tool.cb(input));
  return;
}
