import config from './config';
import { InputType, tool as toolCb } from './src';
import { exportTool } from '@/utils/tool';

export default exportTool({
  toolCb,
  InputType,
  config
});
