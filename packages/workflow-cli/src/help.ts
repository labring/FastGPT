import { cliCommandRegistry, globalCliOptions, getCommandName } from './registry';
import type { CliCommandDefinition } from './type';

const formatOptions = (definition?: CliCommandDefinition) =>
  [...globalCliOptions, ...(definition?.options ?? [])]
    .filter((option) => !['--help', '--version'].includes(option.name))
    .map(
      (option) =>
        `  ${option.name}${option.value ? ' <value>' : ''}${option.required ? ' (required)' : ''}\n      ${option.description}`
    )
    .join('\n');

export const renderHelp = (definition?: CliCommandDefinition) => {
  if (definition) {
    return `Usage: fastgpt-workflow ${getCommandName(definition)} [options]\n\nOptions:\n${formatOptions(definition)}`;
  }
  const commands = cliCommandRegistry.map((item) => `  ${getCommandName(item)}`).join('\n');
  return `Usage: fastgpt-workflow <command> [options]\n\nCommands:\n${commands}\n\nGlobal options:\n${formatOptions()}`;
};
