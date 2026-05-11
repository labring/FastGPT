import { getErrText } from '@fastgpt/global/common/error/utils';
import { pluginClient } from '../../../../thirdProvider/fastgptPlugin';

type RunToolStreamParams = Parameters<typeof pluginClient.runToolStream>[0];
type GetToolParams = Parameters<typeof pluginClient.getTool>[0];

export const isSystemToolVersionMissingError = (error: unknown) => {
  const errorText = String(getErrText(error)).toLowerCase();
  const isMissing =
    errorText.includes('not found') ||
    errorText.includes('not exist') ||
    errorText.includes('unexist') ||
    errorText.includes('找不到') ||
    errorText.includes('不存在');

  return isMissing && (errorText.includes('version') || errorText.includes('tool'));
};

export const getSystemToolWithVersionFallback = async (params: GetToolParams) => {
  try {
    return await pluginClient.getTool(params);
  } catch (error) {
    if (!params.version || !isSystemToolVersionMissingError(error)) {
      throw error;
    }

    return pluginClient.getTool({
      ...params,
      version: undefined
    });
  }
};

export const runSystemToolStreamWithVersionFallback = async (params: RunToolStreamParams) => {
  const response = await pluginClient.runToolStream(params);

  if (!params.version || !response.error || !isSystemToolVersionMissingError(response.error)) {
    return response;
  }

  return pluginClient.runToolStream({
    ...params,
    version: ''
  });
};
