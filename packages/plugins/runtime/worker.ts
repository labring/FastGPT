import { type SystemPluginResponseType } from '../type';
import { parentPort } from 'worker_threads';

const loadModule = async (name: string): Promise<(e: any) => SystemPluginResponseType> => {
  const pluginModule = await import(`../src/${name}/index`);
  return pluginModule.default;
};

parentPort?.on('message', async ({ pluginName, data }: { pluginName: string; data: any }) => {
  try {
    const cb = await loadModule(pluginName);
    parentPort?.postMessage({
      type: 'success',
      data: await cb(data)
    });
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      data: error
    });
  }

  process.exit();
});
