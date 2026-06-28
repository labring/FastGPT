/**
 * 沙盒接口层：提供业务删除和资源清理入口。
 *
 * 外部业务通过本文件清理 app、chat、skill 或指定 sandbox；远端资源删除和本地状态
 * 维护由沙盒内部 resource service 处理。
 */
export {
  deleteSandbox,
  deleteAppChatRuntimeSandboxes,
  deleteAppSandboxes,
  deleteSkillEditSandboxes,
  getSandboxInfo,
  stopSandboxResource,
  stopSandboxResources
} from '../application/resource';
export type { DeleteSandboxParams, GetSandboxInfoParams } from '../application/resource';
