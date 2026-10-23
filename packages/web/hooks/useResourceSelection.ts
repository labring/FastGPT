import { useState } from 'react';

/**
 * 保存资源弹窗的选择及最后一次列表快照，后台重建列表时仍保留当前弹窗。
 * 列表中存在该资源时使用最新值；目录或筛选范围改变时清除选择，避免跨查询恢复旧弹窗。
 */
export const useResourceSelection = <T extends { _id: string }>({
  resources,
  scopeKey
}: {
  resources: T[];
  scopeKey: string;
}) => {
  const [selection, setSelection] = useState<{ resource: T; scopeKey: string }>();
  const selectedResource =
    selection?.scopeKey === scopeKey
      ? (resources.find((resource) => resource._id === selection.resource._id) ??
        selection.resource)
      : undefined;

  // 在渲染时校准快照和查询范围，列表重置或切回旧目录时不会闪现旧的权限弹窗。
  if (selection && selection.resource !== selectedResource) {
    setSelection(selectedResource ? { resource: selectedResource, scopeKey } : undefined);
  }

  const selectResource = (resource?: T) => {
    setSelection(resource ? { resource, scopeKey } : undefined);
  };

  return { selectedResource, selectResource };
};
