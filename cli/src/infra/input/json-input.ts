import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CliArgumentError } from '../../shared/errors';

/** 读取 JSON 请求文件或标准输入；错误不回显原始载荷，避免把用户数据写入诊断信息。 */
export async function readJsonInput({
  file,
  stdin,
  cwd,
  readStdin
}: {
  file?: string;
  stdin?: boolean;
  cwd: string;
  readStdin: () => Promise<string>;
}): Promise<unknown> {
  if (file !== undefined && stdin) {
    throw new CliArgumentError('Use either --file or --stdin.');
  }
  if (file === undefined && !stdin) return {};

  const content = await (async () => {
    if (stdin || file === '-') return readStdin();
    try {
      return await readFile(resolve(cwd, file!), 'utf8');
    } catch {
      throw new CliArgumentError('Unable to read the JSON request file.');
    }
  })();

  try {
    return JSON.parse(content);
  } catch {
    throw new CliArgumentError('Request input must contain valid JSON.');
  }
}
