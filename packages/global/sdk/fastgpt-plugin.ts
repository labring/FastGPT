import { PluginPermissionEnumSchema } from '@fastgpt-plugin/sdk-client';
import z from 'zod';

// export * from '@fastgpt-sdk/plugin';
export * from '@fastgpt-plugin/sdk-client';

export {
  PluginPermissionEnum,
  PluginPermissionEnumSchema,
  FastGPTPluginClient
} from '@fastgpt-plugin/sdk-client';

export const PluginPermissionListSchema = z.array(PluginPermissionEnumSchema);
