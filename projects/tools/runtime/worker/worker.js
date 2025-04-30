import { parentPort } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export async function saveFile(url, path) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(path, Buffer.from(buffer));
  return buffer;
}

const tools = [];
const toolsDir = process.env.TOOLS_DIR || path.join(process.cwd(), 'tools');
const flushCode = randomUUID();

async function LoadTool(mod, defaultToolId) {
  if (!mod.toolId) mod.toolId = defaultToolId;
  if (!mod.isToolSet) {
    tools.push(mod);
  } else {
    const children = mod.children;
    tools.push({
      ...mod,
      children: undefined,
      inputs: [],
      outputs: []
    });
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
    const mod = (await import(filePath)).default;
    const defaultToolId = file.split('.').shift();
    LoadTool(mod, defaultToolId);
  }
  // 2. 读取 tools.json 文件中的配置（通过网络挂载）
  const toolConfigPath = path.join(toolsDir, 'tools.json');
  if (fs.existsSync(toolConfigPath)) {
    const toolConfig = JSON.parse(fs.readFileSync(toolConfigPath, 'utf-8'));
    // every string is a url to get a .js file
    for (const tool of toolConfig) {
      await saveFile(tool.url, path.join(toolsDir, tool.toolId + '.js'));
      const mod = (await import(path.join(toolsDir, tool.toolId + '.js'))).default;
      LoadTool(mod, tool.toolId);
    }
  }
}

export function getTool(toolId) {
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

await LoadToolsProd();

parentPort?.on('message', async ({ toolId, input, id }) => {
  const tool = getTool(toolId);
  if (!tool || !tool.cb) {
    console.error(`Tool with ID ${toolId} not found or does not have a callback.`);
    parentPort.postMessage({
      type: 'error',
      error: new Error(`Tool with ID ${toolId} not found or does not have a callback.`)
    });
  }
  const result = await tool.cb(input);
  parentPort.postMessage({
    type: 'success',
    data: result
  });
});
