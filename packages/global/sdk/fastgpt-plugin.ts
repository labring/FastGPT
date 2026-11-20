import {
  FastGPTPluginClient,
  PluginPermissionEnum as SdkPluginPermissionEnum
} from '@fastgpt-plugin/sdk-client';
import z from 'zod';

export * from '@fastgpt-plugin/sdk-client';

/**
 * 在上游 @fastgpt-plugin/sdk-client 发布包含 model:invoke 的版本前先行扩展权限枚举；
 * 上游合入同名键后对象展开会自动覆盖去重，保持前向兼容。
 */
export const PluginPermissionEnum = {
  ...SdkPluginPermissionEnum,
  'model:invoke': 'model:invoke'
} as const;

export const PluginPermissionEnumSchema = z.enum(PluginPermissionEnum);
export type PluginPermissionEnumType = z.infer<typeof PluginPermissionEnumSchema>;

export { FastGPTPluginClient };

export const PluginPermissionListSchema = z.array(PluginPermissionEnumSchema);
