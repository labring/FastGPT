import { documentCommands } from './commands/document';
import { metaCommands } from './commands/meta';
import { configCommands } from './commands/config';
import { variableCommands } from './commands/variable';
import { templateCommands } from './commands/template';
import { nodeCommands } from './commands/node';
import { edgeCommands } from './commands/edge';
import { inputCommands } from './commands/input';
import { outputCommands } from './commands/output';
import { toolCommands } from './commands/tool';
import { containerCommands } from './commands/container';
import { validateCommands } from './commands/validate';
import { changeSetCommands } from './commands/changeSet';
import { option } from './commandOptions';
import type { CliCommandDefinition, CliOptionDefinition } from './type';

/** 按既有顺序收集命令，供参数解析和帮助文本共用。 */
export const cliCommandRegistry: CliCommandDefinition[] = [
  ...documentCommands,
  ...metaCommands,
  ...configCommands,
  ...variableCommands,
  ...templateCommands,
  ...nodeCommands,
  ...edgeCommands,
  ...inputCommands,
  ...outputCommands,
  ...toolCommands,
  ...containerCommands,
  ...validateCommands,
  ...changeSetCommands
];

export const globalCliOptions: CliOptionDefinition[] = [
  option('--dir', 'Workflow directory'),
  option('--format', 'Output format: text or json'),
  option('--locale', 'Descriptor locale'),
  option('--no-color', 'Disable ANSI color', { value: false }),
  option('--quiet', 'Suppress non-result text', { value: false }),
  option('--help', 'Show help', { value: false }),
  option('--version', 'Show version', { value: false })
];

export const getCommandName = (definition: CliCommandDefinition) => definition.path.join(' ');
