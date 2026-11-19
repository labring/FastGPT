import type { CliCommandSpec } from '../pipeline';
import { createWorkflowChangesetCommandSpecs } from './workflow-build/changeset';
import { createWorkflowDocumentCommandSpecs } from './workflow-build/document';
import { createWorkflowGraphCommandSpecs } from './workflow-build/graph';
import { createWorkflowIoToolCommandSpecs } from './workflow-build/io-tools';
import { createWorkflowMetaConfigCommandSpecs } from './workflow-build/meta-config';
import { createWorkflowBuildSkillsCommandSpec } from './workflow-build/skills';

/** 注册用于初始化、编辑、校验和编译本地工作流的命令。 */
export function createWorkflowBuildCommandSpecs(): CliCommandSpec[] {
  return [
    ...createWorkflowDocumentCommandSpecs(),
    createWorkflowBuildSkillsCommandSpec(),
    ...createWorkflowMetaConfigCommandSpecs(),
    ...createWorkflowGraphCommandSpecs(),
    ...createWorkflowIoToolCommandSpecs(),
    ...createWorkflowChangesetCommandSpecs()
  ];
}
