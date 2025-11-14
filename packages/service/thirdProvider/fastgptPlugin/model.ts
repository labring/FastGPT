import { pluginClient } from '.';

export const loadModelProviders = async () => {
  const res = await pluginClient.model.getProviders();

  if (res.status === 200) {
    return res.body;
  }

  return Promise.reject(res.body);
};
