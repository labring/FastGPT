/**
 * 归一化工具卡片展示标签，过滤掉异步字典未命中或脏数据产生的空标签。
 */
export const normalizeToolCardTags = (tags?: string[] | null) =>
  tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];

/** 获取详情抽屉首次请求的版本；固定版本入口必须原样透传，未指定时交由接口解析最新版。 */
export const getInitialToolDetailVersion = ({ version }: { version?: string }) => version;

/** 根据工具启用状态和 plugin-server 安装记录判断当前版本是否已安装。 */
export const isToolVersionInstalled = ({
  isInstalled,
  currentVersion,
  installedVersions,
  installedVersion
}: {
  isInstalled: boolean;
  currentVersion?: string;
  installedVersions?: string[];
  installedVersion?: string;
}) => {
  if (!isInstalled) return false;
  if (installedVersion === currentVersion) return true;
  if (installedVersions) return installedVersions.includes(currentVersion ?? '');
  if (installedVersion) return false;
  return true;
};
