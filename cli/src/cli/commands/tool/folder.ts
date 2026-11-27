import type { CliCommandSpec } from '../../pipeline';
import { createAppFolderCommandSpecs } from '../shared/app-folder';

/** 注册 FastGPT 工具目录（`toolFolder`）管理命令：list / create / update / delete。 */
export function createToolFolderCommandSpecs(): CliCommandSpec[] {
  return createAppFolderCommandSpecs({
    domain: 'tool',
    folderTypeTag: 'toolFolder',
    label: 'tool folder',
    capitalizedLabel: 'Tool folder',
    exampleName: 'External Tools',
    exampleSearch: 'Coze',
    childNoun: 'tools',
    getService: (container) => container.toolFolderService
  });
}
