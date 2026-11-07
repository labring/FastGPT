import { datasetOperations } from '@fastgpt-sdk/client/dataset/operations';
import type { DatasetOperation } from '@fastgpt-sdk/client/dataset/type';

/** 命令与 SDK 操作一一映射；命令行名称使用单数资源名及 kebab-case 动词。 */
export const datasetCommands = Object.entries(datasetOperations).map(([operation, spec]) => {
  const singular: Record<string, string> = {
    collections: 'collection',
    chunks: 'chunk'
  };
  const aliases: Record<string, string> = {
    batchMove: 'batch move',
    batchDelete: 'batch delete',
    'collections.importFile': 'collection upload'
  };
  const command =
    aliases[operation] ??
    operation
      .split('.')
      .map(
        (part) => singular[part] ?? part.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
      )
      .join(' ');
  return { command: `dataset ${command}`, operation: operation as DatasetOperation, ...spec };
});
