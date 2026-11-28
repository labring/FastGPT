import type { CliCommandSpec } from '../../pipeline';
import { createAppFolderCommandSpecs } from '../shared/app-folder';

/** 注册 FastGPT Agent 目录（`folder`）管理命令：list / create / update / delete。 */
export function createAgentFolderCommandSpecs(): CliCommandSpec[] {
  return createAppFolderCommandSpecs({
    domain: 'agent',
    folderTypeTag: 'folder',
    label: 'agent folder',
    capitalizedLabel: 'Agent folder',
    exampleName: 'Migrated Agents',
    exampleSearch: 'Coze',
    childNoun: 'agents',
    getService: (container) => ({
      list: container.agentService.listFolders,
      create: container.agentService.createFolder,
      update: container.agentService.updateFolder,
      delete: container.agentService.deleteFolder
    })
  });
}
