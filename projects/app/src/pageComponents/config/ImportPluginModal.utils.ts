export type UploadedPluginSourceItem = {
  rowId: string;
  name: string;
  sourceName?: string;
};

export const getUploadedPluginSourceName = (
  file: Pick<UploadedPluginSourceItem, 'name' | 'sourceName'>
) => file.sourceName || file.name;

/**
 * 按上传结果行删除插件，zip 拆出的多条插件记录共享 sourceName，
 * 因此删除时必须使用 rowId 定位单行，只在同源记录全部删除后释放源文件。
 */
export const removeUploadedPluginFileByRow = <T extends UploadedPluginSourceItem>(
  files: T[],
  file: T
) => {
  const sourceName = getUploadedPluginSourceName(file);
  const nextUploadedFiles = files.filter((item) => item.rowId !== file.rowId);
  const hasSameSourceFile = nextUploadedFiles.some(
    (item) => getUploadedPluginSourceName(item) === sourceName
  );

  return {
    nextUploadedFiles,
    sourceNameToRemove: hasSameSourceFile ? undefined : sourceName
  };
};
