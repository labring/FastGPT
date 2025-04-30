// 你不应该修改本文件，如果你需要修改工具集的配置，请修改 config.ts 文件
// You  should not modify this file, if you need to modify the tool set configuration, please modify the config.ts file

import type { ToolSetType } from '@/type';
import config from './config';

config.toolId = config.toolId ?? __dirname.split('/').pop()?.split('.').shift();
config.children.forEach((child) => {
  child.toolId = config.toolId + '/' + child.toolId;
});

export default <ToolSetType>{
  ...config
};
