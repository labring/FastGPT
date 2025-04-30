import fs from 'fs';
import path from 'path';
import type { ToolSetType, ToolType } from '../../type';
import { randomUUID } from 'crypto';

export async function saveFile(url: string, path: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(path, Buffer.from(buffer));
  return buffer;
}

const tools: ToolType[] = [];
const toolsDir = process.env.TOOLS_DIR || path.join(process.cwd(), 'tools');
const flushCode = randomUUID();

async function LoadTool(mod: ToolType | ToolSetType, defaultToolId: string) {
  if (!mod.toolId) mod.toolId = defaultToolId;
  if (!mod.isToolSet) {
    tools.push(mod as ToolType);
  } else {
    const children = (mod as ToolSetType).children;
    tools.push({
      ...mod,
      children: undefined,
      inputs: [],
      outputs: []
    } as any);
    tools.push(...children);
  }
}

async function LoadToolsProd() {
  // 两种方式：
  // 1. 读取 tools 目录下所有目录的 index.js 文件作为 tool
  const files = fs.readdirSync(toolsDir);
  console.log(files);
  for (const file of files) {
    const filePath = path.join(toolsDir, file);
    const mod = (await import(filePath)).default as ToolType;
    const defaultToolId = file.split('.').shift() as string;
    LoadTool(mod, defaultToolId);
  }
  // 2. 读取 tools.json 文件中的配置（通过网络挂载）
  const toolConfigPath = path.join(toolsDir, 'tools.json');
  if (fs.existsSync(toolConfigPath)) {
    const toolConfig = JSON.parse(fs.readFileSync(toolConfigPath, 'utf-8')) as {
      toolId: string;
      url: string;
    }[];
    // every string is a url to get a .js file
    for (const tool of toolConfig) {
      await saveFile(tool.url, path.join(toolsDir, tool.toolId + '.js'));
      const mod = (await import(path.join(toolsDir, tool.toolId + '.js'))).default as ToolType;
      LoadTool(mod, tool.toolId);
    }
  }
  console.log(
    `\
=================
reading tools in prod mode
tools:\n[ ${tools.map((tool) => tool.toolId).join(', ')} ]
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
    const mod = (await import(toolPath)).default as ToolType | ToolSetType;
    LoadTool(mod, tool);
  }
  console.log(
    `\
=================
reading tools in dev mode
tools:\n[ ${tools.map((tool) => tool.toolId).join(', ')} ]
amount: ${tools.length}
=================
      `
  );
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

export function getFlushCode() {
  return flushCode;
}

export async function init(prod: boolean) {
  if (prod) {
    await LoadToolsProd();
  } else {
    await LoadToolsDev();
  }
}
