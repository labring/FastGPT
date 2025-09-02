import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type.d';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

export type PluginOutputProps = ModuleDispatchProps<{
  [key: string]: any;
}>;
export type PluginOutputResponse = DispatchNodeResultType<{}>;

export const dispatchPluginOutput = (props: PluginOutputProps): PluginOutputResponse => {
  const { params } = props;

  // 在这里添加 SYSTEM_PLUGIN_BASE64 转换逻辑
  const convertSystemPluginBase64ToMarkdown = (
    pluginOutput: Record<string, any>
  ): Record<string, any> => {
    const convertedOutput = { ...pluginOutput };

    for (const [key, value] of Object.entries(convertedOutput)) {
      if (value && typeof value === 'object' && value.type === 'SYSTEM_PLUGIN_BASE64') {
        const mimeType = value.extension === 'svg' ? 'image/svg+xml' : `image/${value.extension}`;
        const markdownImage = `![${key}](data:${mimeType};base64,${value.value})`;
        convertedOutput[key] = markdownImage;
      }
    }

    return convertedOutput;
  };

  const convertedParams = convertSystemPluginBase64ToMarkdown(params);

  return {
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: 0,
      pluginOutput: convertedParams
    }
  };
};
