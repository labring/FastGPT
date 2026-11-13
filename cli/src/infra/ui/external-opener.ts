import { spawn } from 'node:child_process';

/**
 * 调用系统默认程序打开本地文件（用于 2FA 图形验证码预览），失败不阻断流程。
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
