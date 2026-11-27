import type { CliCommandSpec } from '../pipeline';
import { createToolFolderCommandSpecs } from './tool/folder';
import { createToolHttpCommandSpecs } from './tool/http';
import { createToolMcpCommandSpecs } from './tool/mcp';

/** 汇总 FastGPT 工具目录、MCP 工具集与 HTTP 工具集命令。 */
export function createToolCommandSpecs(): CliCommandSpec[] {
  return [
    ...createToolFolderCommandSpecs(),
    ...createToolMcpCommandSpecs(),
    ...createToolHttpCommandSpecs()
  ];
}
