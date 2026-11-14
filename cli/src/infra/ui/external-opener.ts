import { spawn } from 'node:child_process';

/**
 * 调用系统默认程序打开 URL 或本地文件；旋转验证使用本机浏览器页面，失败不阻断手动打开。
 * Windows 下直接调用 `explorer.exe` 绕过 `cmd.exe` 命令解析，避免路径元字符注入风险。
 */
export function openExternalFile(targetPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const { command, args } = (() => {
      if (process.platform === 'darwin') {
        return { command: 'open', args: [targetPath] };
      }
      if (process.platform === 'win32') {
        return { command: 'explorer.exe', args: [targetPath] };
      }
      return { command: 'xdg-open', args: [targetPath] };
    })();

    const child = spawn(command, args, {
      stdio: 'ignore',
      detached: true
    });
    child.once('error', () => resolve(false));
    child.once('spawn', () => {
      child.unref();
      resolve(true);
    });
  });
}
