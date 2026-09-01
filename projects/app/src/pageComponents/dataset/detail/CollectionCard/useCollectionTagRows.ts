import { useMemo, useState } from 'react';
import { type DatasetTagType } from '@fastgpt/global/core/dataset/type';
import { emptyTagRowValue, isTagRowComplete, type CollectionTagRow } from './tagForm';

/**
 * 设置标签 / 批量添加共用的表格行状态。
 * 未编辑时跟随 initialRows（设置弹窗等标签定义加载完再灌入已有值）；编辑后锁在 draft 上。
 */
export const useCollectionTagRows = <T extends CollectionTagRow>({
  tags,
  initialRows,
  createRow,
  patchOnTagChange,
  onRowDeleted
}: {
  tags: DatasetTagType[];
  initialRows: T[];
  createRow: () => T;
  patchOnTagChange?: (tagDoc?: DatasetTagType) => Partial<T>;
  onRowDeleted?: () => void;
}) => {
  const [draftRows, setDraftRows] = useState<T[]>();
  const rows = draftRows ?? initialRows;

  const hasIncompleteRow = useMemo(
    () => rows.some((row) => !isTagRowComplete(row, tags)),
    [rows, tags]
  );

  const isAddDisabled = hasIncompleteRow || tags.length === 0 || rows.length >= tags.length;

  const updateRows = (updater: (current: T[]) => T[]) => {
    setDraftRows((prev) => updater(prev ?? rows));
  };

  const handleAddRow = () => {
    if (isAddDisabled) return;
    updateRows((current) => [...current, createRow()]);
  };

  const handleDeleteRow = (id: string) => {
    updateRows((current) => current.filter((row) => row.id !== id));
    onRowDeleted?.();
  };

  const handleTagChange = (rowId: string, newTagId: string) => {
    const tagDoc = tags.find((tag) => String(tag._id) === newTagId);
    updateRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              tagId: newTagId,
              value: emptyTagRowValue(tagDoc?.tagType),
              ...patchOnTagChange?.(tagDoc)
            }
          : row
      )
    );
  };

  const handleValueChange = (rowId: string, value: string | number | string[]) => {
    updateRows((current) => current.map((row) => (row.id === rowId ? { ...row, value } : row)));
  };

  return {
    rows,
    hasIncompleteRow,
    isAddDisabled,
    updateRows,
    handleAddRow,
    handleDeleteRow,
    handleTagChange,
    handleValueChange
  };
};
