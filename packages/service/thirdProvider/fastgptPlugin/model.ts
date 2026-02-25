import { pluginClient } from '.';

export const loadModelProviders = async () => {
  return await pluginClient.getModelProviders();
};
