import { getTool } from '../utils/tools';
import { prod } from '..';
import { dispatchWithNewWorker } from '../worker';
import { contract, runType } from '../contract';
import { s } from './init';

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
        body: result
      };
    }
    const result = await tool.cb(input);
    console.log('run', toolId, input, result);
    return {
      status: 200,
      body: result
    };
  } catch (error) {
    return {
      status: 400,
      body: { error: `error:  ${error}` }
    };
  }
});
