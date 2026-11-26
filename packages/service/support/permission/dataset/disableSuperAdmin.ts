import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { serviceEnv } from '../../../env';

/**
 * 部署开关是否要求超管（root / 团队 owner）在 API 文件库管理侧遵守外部文件权限。
 *
 * 环境变量 `DISABLE_APIDATASET_SUPER_ADMIN`，只对配置了 `apiDatasetServer` 的知识库生效、
 * 默认关闭；普通知识库与检索 / RAG 召回不受影响。
 */
export const isSuperAdminBypassDisabled = () => serviceEnv.DISABLE_APIDATASET_SUPER_ADMIN;

/**
 * 该知识库是否需要关闭超管旁路：开关打开且是 API 文件库（配置了 apiDatasetServer）。
 *
 * 作用范围只有本地 Dataset / Collection 鉴权（authDatasetByTmbId、authDatasetCollection、
 * list / listV2、exportAll、getDownloadTicket 等），普通知识库仍保留 root / 团队 owner 旁路。
 * 检索 / RAG 召回**不读取**该开关：工作流检索、Agent 知识库仍按团队 owner 短路。该开关用来让
 * 管理员在管理界面上也遵守外部文件权限，不是用来限制检索范围，也不是用来收紧站内知识库。
 */
export const isDisableSuperAdmin = (apiDatasetServer?: ApiDatasetServerType) =>
  isSuperAdminBypassDisabled() && !!apiDatasetServer;
