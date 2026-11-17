import type { CliCommandSpec } from '../pipeline';
import { createWorkflowChangesetCommandSpecs } from './workflow/changeset';
import { createWorkflowDocumentCommandSpecs } from './workflow/document';
import { createWorkflowGraphCommandSpecs } from './workflow/graph';
import { createWorkflowIoToolCommandSpecs } from './workflow/io-tools';
import { createWorkflowMetaConfigCommandSpecs } from './workflow/meta-config';
import { createWorkflowSyncCommandSpecs } from './workflow/sync';

/**
 * 汇总工作流域（Workflow）全部 CLI 命令：
 * 本地 DSL 编排（document/meta/config/variable/template/node/edge/input/output/tool/container/changeset）
 * 与云端 GitOps 同步、调试、代码辅助及自动化测试（pull/diff/push/publish/debug/sandbox-packages/optimize-code/test）。
 */
export function createWorkflowCommandSpecs(): CliCommandSpec[] {
  return [
    ...createWorkflowDocumentCommandSpecs(),
    ...createWorkflowMetaConfigCommandSpecs(),
    ...createWorkflowGraphCommandSpecs(),
    ...createWorkflowIoToolCommandSpecs(),
    ...createWorkflowChangesetCommandSpecs(),
    ...createWorkflowSyncCommandSpecs()
  ];
}
