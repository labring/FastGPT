import { pluginClient } from './index';
import type {
  PluginListItemType,
  ToolListItemType,
  ToolDetailType,
  ModerationDetailType
} from '@fastgpt/global/sdk/fastgpt-plugin';

/** List retained installations, including disabled ones, for administrator recovery only. */
export const listRetainedPlugins = (): Promise<PluginListItemType[]> =>
  pluginClient.listPlugins({ includeDisabled: true, sources: ['system'] });

/** List retained tool summaries without exposing disabled tools to business callers. */
export const listRetainedTools = (): Promise<ToolListItemType[]> =>
  pluginClient.listTools({ includeDisabled: true, sources: ['system'] });

/** Disable only the system installation; retries skip installations already disabled. */
export const disableSystemPlugin = async (pluginId: string) => {
  const installed = (await listRetainedPlugins()).find((item) => item.pluginId === pluginId);
  if (!installed || installed.installationStatus === 'disabled') return;
  await pluginClient.deletePlugin({ pluginId, source: 'system', scope: 'allVersions' });
};

/** Reactivate retained files before exposing the plugin in FastGPT. Pruned packages require reinstallation. */
export const restoreSystemPlugin = async (pluginId: string) => {
  const installed = (await listRetainedPlugins()).find((item) => item.pluginId === pluginId);
  if (!installed) throw new Error('插件文件已清理，请重新上传或从插件市场安装');
  await pluginClient.restorePlugin({
    pluginId,
    source: 'system',
    version: installed.version,
    etag: installed.etag
  });
};

/** Read disabled metadata only on administrator paths; never use this to invoke tools. */
export const getRetainedToolDetail = (
  pluginId: string,
  version?: string
): Promise<ToolDetailType> =>
  pluginClient.getTool({
    pluginId,
    source: 'system',
    includeDisabled: true,
    ...(version ? { version } : {})
  });

/** Read retained moderation metadata for recovery. */
export const getRetainedModerationDetail = (
  pluginId: string,
  source = 'system'
): Promise<ModerationDetailType> =>
  pluginClient.getModeration({
    pluginId,
    source,
    includeDisabled: true
  });
