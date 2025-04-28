import type { Request, Response } from 'express';
import { getTools } from '../utils/tools';

export async function list(req: Request, res: Response) {
  const tools = getTools();
  res.json(tools);
}
