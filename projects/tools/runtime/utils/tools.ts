import fs from 'fs';
import path from 'path';
import type { ToolType } from '../../type';

const tools: ToolType[] = [];
const toolsDir = process.env.TOOLS_DIR || path.join(process.cwd(), 'tools');

async function LoadToolsProd() {
  // 两种方式：
  // 1. 读取 tools 目录下所有目录的 index.js 文件作为 tool
  const files = fs.readdirSync(toolsDir);
  for (const file of files) {
    const filePath = path.join(toolsDir, file);
    if (fs.statSync(filePath).isDirectory()) {
      const toolPath = path.join(filePath, 'index.js');
      tools.push((await import(toolPath)).default as ToolType);
    }
  }
  // 2. 读取 tools.json 文件中的配置（通过网络挂载）
  // TODO

  console.log(
    `\
=================
reading tools in prod mode
tools: ${tools.map((tool) => tool.toolId).join('\n')}
amount: ${tools.length}
=================
    `
  );
}

async function LoadToolsDev() {
  const toolsPath = path.join(process.cwd(), '..', 'tools');
  const toolDirs = fs.readdirSync(toolsPath);
  for (const tool of toolDirs) {
    const toolPath = path.join(toolsPath, tool);
    tools.push((await import(toolPath)).default as ToolType);
  }
  console.log(`reading tools from ${toolsPath} in dev mode, toolFiles: ${toolDirs}`);
}

export function getTool(toolId: string): ToolType | undefined {
  return tools.find((tool) => tool.toolId === toolId);
}

export function getTools() {
  return tools.map((tool) => ({
    ...tool,
    cb: undefined
  }));
}

export async function init(prod: boolean) {
  if (prod) {
    await LoadToolsProd();
  } else {
    await LoadToolsDev();
  }
}
