import { TabEnum } from './context';

/** 判断只读成员是否需要从当前应用页签跳转到可访问的日志页。 */
export const shouldRouteReadOnlyAppToLogs = ({
  hasWritePermission,
  currentTab
}: {
  hasWritePermission: boolean;
  currentTab: TabEnum;
}) => !hasWritePermission && currentTab !== TabEnum.logs;
