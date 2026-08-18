import { describe, expect, it } from 'vitest';
import { MongoSystemTool } from '@fastgpt/service/core/plugin/tool/systemToolSchema';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';

describe('MongoSystemTool status mapping', () => {
  it('persists and reads the hidden status', () => {
    const tool = new MongoSystemTool({
      pluginId: 'systemTool-weather',
      status: PluginStatusEnum.Hidden
    });

    expect(tool.status).toBe(PluginStatusEnum.Hidden);
  });
});
