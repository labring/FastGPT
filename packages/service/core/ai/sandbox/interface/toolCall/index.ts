/**
 * 沙盒接口层：提供 workflow/agent 调用 sandbox tools 的业务入口。
 *
 * 本文件只对外暴露工具准备、执行和展示信息查询；具体工具定义和运行时准备逻辑
 * 仍由沙盒内部实现维护。
 */
export {
  getSandboxToolInfo,
  prepareSandboxToolRuntime,
  runSandboxTools
} from '../../application/toolCall';
export type { SandboxToolCallResult } from '../../application/toolCall';
