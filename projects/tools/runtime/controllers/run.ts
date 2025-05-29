import { z } from 'zod';
import { getTool } from '../utils/tools';
import { prod } from '..';
import { dispatchWithNewWorker } from '../worker';
import { contract } from '../contract';
import { s } from './init';

export const runType = z.object({
  toolId: z.string(),
  input: z.record(z.string())
});

// export async function run(req: Request<0, 0, z.infer<typeof runType>>, res: Response) {
//   const { toolId, input } = runType.parse(req.body);
//   const tool = getTool(toolId);
//   if (!tool) {
//     res.status(404).json({ error: 'tool not found' });
//     return;
//   }
//   if (prod) {
//     // const result = await dispatch({ toolId, input });
//     const result = await dispatchWithNewWorker({ toolId, input });
//     res.json(result);
//     return;
//   }
//   res.json(await tool.cb(input));
//   return;
// }

export const run = s.route(contract.run, async (args) => {
  const { toolId, input } = runType.parse(args.body);
  const tool = getTool(toolId);
  if (!tool) {
    return {
      status: 404,
      body: { error: 'tool not found' }
    };
  }
  try {
    if (prod) {
      // const result = await dispatch({ toolId, input });
      const result = await dispatchWithNewWorker({ toolId, input });
      return {
        status: 200,
        body: contract.run.responses[200].parse(result)
      };
    }
    return {
      status: 200,
      body: await tool.cb(input)
    };
  } catch (error) {
    return {
      status: 400,
      body: { error: error.message }
    };
  }
});
