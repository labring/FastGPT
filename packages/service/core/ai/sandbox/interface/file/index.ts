/** 沙盒 workspace 文件读写和打包的公开入口。 */
export {
  addDirectoryToArchive,
  getSandboxFileContent,
  isSandboxPathDirectory,
  resolveSandboxWorkspacePath,
  writeUrlFilesToSandbox
} from '../../application/file';
export type { SandboxFileContent, SandboxUrlFile } from '../../application/file';
