import fs from 'fs';
import path from 'path';
import type { ToolType } from '../../type';
export async function downloadFile(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const file = new File([blob], filename);
  return file;
}

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
  const toolConfigPath = path.join(toolsDir, 'tools.json');
  if (fs.existsSync(toolConfigPath)) {
    const toolConfig = JSON.parse(fs.readFileSync(toolConfigPath, 'utf-8')) as {
      toolId: string;
      url: string;
    }[];
    // every string is a url to get a .pkg file
    for (const tool of toolConfig) {
      const file = await downloadFile(tool.url, tool.toolId); // TODO
    }
  }
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
    const mod = (await import(toolPath)).default as ToolType;
    if (!mod.toolId) mod.toolId = tool;
    if (!mod.isFolder) tools.push(mod);
    else {
      // is folder
      const subTools = fs.readdirSync(path.join(toolPath)).filter((i) => i !== 'index.ts');
      for (const subTool of subTools) {
        const subToolPath = path.join(toolPath, subTool);
        const subMod = (await import(subToolPath)).default as ToolType;
        if (!subMod.toolId) subMod.toolId = `${mod.toolId}/${subTool}`;
        tools.push(subMod);
      }
    }
  }
  console.log(
    `\
=================
reading tools from ${toolsPath} in dev mode
tool amount: ${tools.length}
tools:
${tools.map((tool) => tool.toolId).join('\n')}
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

export async function init(prod: boolean) {
  if (prod) {
    await LoadToolsProd();
  } else {
    await LoadToolsDev();
  }
}
