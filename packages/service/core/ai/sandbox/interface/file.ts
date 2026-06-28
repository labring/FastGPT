/**
 * 沙盒接口层：提供 sandbox workspace 文件读写和打包入口。
 *
 * 本文件收口 SandboxEditor 下载、预览和目录打包所需的文件能力；业务调用方不应
 * 直接依赖底层 SandboxClient 文件系统细节。
 */
export {
  addDirectoryToArchive,
  getSandboxFileContent,
  isSandboxPathDirectory,
  resolveSandboxWorkspacePath,
  writeUrlFilesToSandbox
} from '../application/file';
export type { SandboxFileContent, SandboxUrlFile } from '../application/file';
