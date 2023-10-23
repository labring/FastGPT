import type { NextApiResponse } from 'next';
import { generateQA } from '../events/generateQA';
import { generateVector } from '../events/generateVector';
import { spawn, ChildProcess } from 'child_process';
import { ChatResponse } from '@/service/moduleDispatch/chat/oneapi';
import fs from 'fs';
import path from 'path';
import * as iconv from 'iconv-lite';

interface ConnectionParams {
  prefix?: string;
  username?: string;
  password?: string;
  host?: string;
  port?: number;
  database?: string;
}

export function parseConnectionString(connectionString: string): ConnectionParams {
  const result: ConnectionParams = {};

  // 解析前缀
  const prefixRegex = /^([^:]+):\/\//;
  const prefixMatch = connectionString.match(prefixRegex);
  if (prefixMatch) {
    result.prefix = prefixMatch[1];
  }

  // 解析用户名和密码
  const credentialsRegex = /\/\/([^:]+):([^@]+)@/;
  const credentialsMatch = connectionString.match(credentialsRegex);
  if (credentialsMatch) {
    result.username = credentialsMatch[1];
    result.password = credentialsMatch[2];
  }

  // 解析主机和端口
  const hostPortRegex = /@([^\/:]+)(?::(\d+))?\/?/;
  const hostPortMatch = connectionString.match(hostPortRegex);
  if (hostPortMatch) {
    result.host = hostPortMatch[1];
    result.port = hostPortMatch[2] ? parseInt(hostPortMatch[2]) : undefined; // 解析端口号，如果不存在则设为 null
  }

  // 解析数据库名称
  const databaseRegex = /\/([^/]+)$/;
  const databaseMatch = connectionString.match(databaseRegex);
  if (databaseMatch) {
    result.database = databaseMatch[1];
  }

  return result;
}

async function runPythonCode(pythonCode: string): Promise<string> {
  let command = process.env.PY_PATH || 'python'; // 'D:\\pyenv\\.pyenv\\pyenv-win\\versions\\3.10.11\\python.exe'

  return new Promise<string>((resolve, reject) => {
    const pythonProcess = spawn(command, ['-c', pythonCode]);

    let result: Buffer[] = [];
    let error: Buffer[] = [];

    pythonProcess.stdout?.on('data', (data: Buffer) => {
      result.push(data);
    });

    pythonProcess.stderr?.on('data', (data: Buffer) => {
      error.push(data);
    });

    pythonProcess.on('close', (code: number) => {
      let out = '';
      let err = '';
      const output = Buffer.concat(result);
      const err_output = Buffer.concat(error);
      if (process.platform == 'win32') {
        out = iconv.decode(output, 'cp936');
        err = iconv.decode(err_output, 'cp936');
      }
      if (code === 0) {
        resolve(out);
      } else {
        reject(new Error(`Python process exited with code ${code}\n${err}`));
      }
    });
  });
}

function extractPythonCodeFromMarkdown(markdown: string): string[] {
  const codeBlocks: string[] = [];
  const codeRegex = /```python([\s\S]*?)```/g;
  let match;

  while ((match = codeRegex.exec(markdown)) !== null) {
    const codeBlock = match[1].trim();
    codeBlocks.push(codeBlock);
  }

  return codeBlocks;
}
function getMarkdownFile(folderName: string, fileName: string = 'axio_ai.png'): string {
  const rootDir = process.cwd();
  const folderPath = path.join(rootDir, 'public', folderName);
  const filePath = path.join(folderPath, fileName);

  try {
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
      console.log(`文件夹 ${folderPath} 创建成功`);
    }
    if (!fs.existsSync(fileName)) {
      return '';
    }
    fs.rename(fileName, filePath, (error) => {
      if (error) {
        console.error('移动文件失败:' + fileName, error);
      }
    });
    const publicPath = path.join(folderName, fileName);
    const publicUrl = `/${publicPath}`.replaceAll('\\', '/');
    console.log(`成功生成文件:${filePath}`);

    const markdownContent = `![axio_ai.png](${publicUrl})`;
    return markdownContent;
  } catch (error) {
    console.error(`获取文件 ${fileName} 失败：`, error);
    return '';
  }
}
function getFileName(str: string): string {
  const regex = /filename=([^&]+)/;
  const match = str.match(regex);
  if (match && match[1]) {
    return match[1];
  }
  return '';
}
export async function checkRunPythonCode(answer: string): Promise<string> {
  let answerText: string = '';
  const code: string[] = extractPythonCodeFromMarkdown(answer);
  if (code.length) {
    console.log('检测到python代码，现在开始运行代码');
    let ret = (await runPythonCode(code.join('\n'))).trim();
    const filename = getFileName(ret);
    console.log(`代码已运行完毕，得到:${filename}`);
    answerText = getMarkdownFile('ai_temp', filename) + '\n' + ret;
  }
  return answerText;
}

/* start task */
export const startQueue = () => {
  if (!global.systemEnv) return;
  for (let i = 0; i < global.systemEnv.qaMaxProcess; i++) {
    generateQA();
  }
  for (let i = 0; i < global.systemEnv.vectorMaxProcess; i++) {
    generateVector();
  }
};

/* add logger */
export const addLog = {
  info: (msg: string, obj?: Record<string, any>) => {
    global.logger?.info(msg, { meta: obj });
  },
  error: (msg: string, error?: any) => {
    global.logger?.error(msg, {
      meta: {
        stack: error?.stack,
        ...(error?.config && {
          config: {
            headers: error.config.headers,
            url: error.config.url,
            data: error.config.data
          }
        }),
        ...(error?.response && {
          response: {
            status: error.response.status,
            statusText: error.response.statusText
          }
        })
      }
    });
  }
};
