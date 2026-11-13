import { Command } from 'commander';
import { getCliVersion, type CliFormat, type CommandMeta } from '../shared/types';
import type { CliContainer } from './container';
import { executeCommandWithPipeline, type CliCommandSpec } from './pipeline';

const GROUP_DESCRIPTIONS: Record<string, string> = {
  auth: 'Manage profiles, auth status, and active team sessions',
  config: 'Inspect and update CLI configuration values',
  dataset: 'Manage datasets, collections, chunks, and OpenAPI search',
  'dataset collection': 'Manage dataset collections and text/link/file imports',
  'dataset data': 'List, inspect, push, update, and delete dataset chunks',
  chat: 'Run App conversations and manage their history and messages',
  'chat history': 'Manage App conversations and their status',
  'chat record': 'Read App messages and detailed responses'
};

function attachCommandSpec({
  parent,
  name,
  spec,
  defaultFormat,
  defaultColor,
  container,
  commandMetas,
  stdout
}: {
  parent: Command;
  name: string;
  spec: CliCommandSpec;
  defaultFormat: CliFormat;
  defaultColor: boolean;
  container: CliContainer;
  commandMetas: readonly CommandMeta[];
  stdout: (value: string) => void;
}): Command {
  const cmd = parent.command(name).description(spec.summary);

  for (const pos of spec.positionalArgs ?? []) {
    cmd.argument(pos.required ? `<${pos.name}>` : `[${pos.name}]`, pos.description);
  }

  for (const opt of spec.options) {
    cmd.option(opt.flags, opt.description);
  }

  const examplesText = (spec.examples ?? [])
    .map((ex) => `  # ${ex.description}\n  $ fastgpt ${ex.args.join(' ')}`)
    .join('\n\n');
  cmd.addHelpText(
    'after',
    `\nMetadata:\n  Risk: ${spec.risk} | Auth: ${spec.authModes.join(', ')}${examplesText ? `\n\nExamples:\n${examplesText}` : ''}`
  );

  spec.configure?.(cmd);

  cmd.action(async (...actionArgs: unknown[]) => {
    const commandInstance = actionArgs[actionArgs.length - 1] as Command;
    const positionalArgs = actionArgs
      .slice(0, (spec.positionalArgs ?? []).length)
      .filter((item): item is string => typeof item === 'string');

    await executeCommandWithPipeline({
      spec,
      rawOptions: commandInstance.optsWithGlobals(),
      positional: positionalArgs,
      defaultFormat,
      defaultColor,
      container,
      commandMetas,
      stdout
    });
  });

  return cmd;
}

/**
 * 使用 `commander` 构建完整命令树与嵌套分组，绑定全局选项、中间件管线和自定义输出通道。
 */
export function buildCommanderProgram({
  specs,
  commandMetas,
  container,
  defaultFormat,
  defaultColor,
  stdout,
  onCommanderWriteErr
}: {
  specs: readonly CliCommandSpec[];
  commandMetas: readonly CommandMeta[];
  container: CliContainer;
  defaultFormat: CliFormat;
  defaultColor: boolean;
  stdout: (value: string) => void;
  onCommanderWriteErr?: (value: string) => void;
}): Command {
  const program = new Command();

  program
    .name('fastgpt')
    .description('Official CLI for FastGPT')
    .version(getCliVersion(), '-v, --version', 'Show CLI version')
    .option('--profile <name>', 'Profile name to use')
    .option('--base-url <url>', 'Override FastGPT server base URL')
    .option('--token <token>', 'Override session token')
    .option('--api-key <key>', 'Override API Key')
    .option('--allow-insecure-http', 'Allow plain http:// for non-localhost servers')
    .option('--insecure', 'Skip TLS certificate verification')
    .option('--ca-cert <path>', 'Path to custom CA PEM bundle')
    .option('--format <format>', 'Output format: text or json (defaults to json when not a TTY)')
    .option('--fields <fields>', 'Select comma-separated output fields (e.g. _id,name)')
    .option('--pick <path>', 'Extract a dot-path value from output (e.g. data.datasetId)')
    .option('--raw', 'Output un-enveloped data or extracted --pick value directly')
    .option('--no-color', 'Disable ANSI color')
    .option('--quiet', 'Suppress banners and warnings')
    .showHelpAfterError(false)
    .exitOverride()
    .configureOutput({
      writeOut: (str) => stdout(str.replace(/\n$/, '')),
      writeErr: (str) => onCommanderWriteErr?.(str),
      outputError: () => {}
    });

  program.addHelpText(
    'after',
    '\nAgent quickstart:\n  $ fastgpt commands --format json   # Discover registered commands & auth requirements\n  $ fastgpt doctor --format json     # Check runtime, config, server reachability & identity'
  );

  const groups = new Map<string, Command>();

  function getOrCreateParent(pathSegments: readonly string[]): { parent: Command; leaf: string } {
    if (pathSegments.length === 1) {
      return { parent: program, leaf: pathSegments[0] };
    }

    let current = program;
    for (let i = 0; i < pathSegments.length - 1; i += 1) {
      const seg = pathSegments[i];
      const key = pathSegments.slice(0, i + 1).join(' ');
      let group = groups.get(key);
      if (!group) {
        group = current
          .command(seg)
          .description(
            GROUP_DESCRIPTIONS[key] ?? GROUP_DESCRIPTIONS[seg] ?? `Manage ${seg} resources`
          );
        groups.set(key, group);
      }
      current = group;
    }

    return {
      parent: current,
      leaf: pathSegments[pathSegments.length - 1]
    };
  }

  for (const spec of specs) {
    const { parent, leaf } = getOrCreateParent(spec.path);
    attachCommandSpec({
      parent,
      name: leaf,
      spec,
      defaultFormat,
      defaultColor,
      container,
      commandMetas,
      stdout
    });

    for (const aliasPath of spec.aliases ?? []) {
      const segments = aliasPath.trim().split(/\s+/);
      const { parent: aliasParent, leaf: aliasLeaf } = getOrCreateParent(segments);
      attachCommandSpec({
        parent: aliasParent,
        name: aliasLeaf,
        spec,
        defaultFormat,
        defaultColor,
        container,
        commandMetas,
        stdout
      });
    }
  }

  return program;
}
