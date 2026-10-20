import { cliCommandRegistry } from '../src/registry';
import { renderHelp } from '../src/help';
import { describe, expect, it } from 'vitest';

describe('cliCommandRegistry', () => {
  it('registers exactly the PR1 through PR4 command surface once', () => {
    const paths = cliCommandRegistry.map((definition) => definition.path.join(' '));
    expect(new Set(paths).size).toBe(paths.length);

    // 每行保留命令、版本、类别、dry-run、确认策略和选项，避免大段对象快照掩盖协议变化。
    const surface = cliCommandRegistry.map((definition) =>
      [
        definition.path.join(' '),
        definition.introducedIn,
        definition.kind,
        definition.supportsDryRun,
        definition.confirm,
        definition.options.map((item) => item.name).join(' ')
      ].join(' | ')
    );
    expect(surface).toEqual([
      'init | PR1 | localMutation | true | none | --name --dry-run',
      'build | PR1 | artifact | false | none | --output',
      'import | PR2 | localMutation | true | none | --input --dry-run',
      'inspect | PR2 | query | false | none | ',
      'meta show | PR2 | query | false | none | ',
      'meta set | PR2 | localMutation | true | none | --name --intro --dry-run',
      'config list | PR2 | query | false | none | ',
      'config get | PR2 | query | false | none | --path',
      'config set | PR2 | localMutation | true | none | --path --value --value-json --value-file --value-env --dry-run',
      'config unset | PR2 | localMutation | true | none | --path --dry-run',
      'variable list | PR2 | query | false | none | ',
      'variable add | PR2 | localMutation | true | none | --key --type --value-type --label --description --required --config-json --config-file --options-json --min --max --max-length --time-granularity --value --value-json --value-file --value-env --dry-run',
      'variable update | PR2 | localMutation | true | none | --key --new-key --type --value-type --label --description --required --optional --config-json --config-file --options-json --min --max --max-length --time-granularity --value --value-json --value-file --value-env --dry-run',
      'variable remove | PR2 | localMutation | true | none | --key --dry-run',
      'template list | PR1 | query | false | none | --kind',
      'template show | PR1 | query | false | none | --template',
      'node list | PR1 | query | false | none | --type --parent',
      'node show | PR1 | query | false | none | --node',
      'node add | PR1 | localMutation | true | none | --node --template --name --after --parent --position --dry-run',
      'node update | PR2 | localMutation | true | none | --node --name --position --catch-error --no-catch-error --dry-run',
      'node move | PR3 | localMutation | true | none | --node --position --parent --root --dry-run',
      'node insert | PR3 | localMutation | true | none | --from --to --template --id --position --dry-run',
      'node clone | PR2 | localMutation | true | none | --node --id --position --offset --dry-run',
      'node remove | PR2 | localMutation | true | none | --node --dry-run',
      'edge list | PR2 | query | false | none | --node --kind',
      'edge connect | PR2 | localMutation | true | none | --from --to --dry-run',
      'edge disconnect | PR2 | localMutation | true | none | --from --to --dry-run',
      'edge reconnect | PR2 | localMutation | true | none | --from --old-to --to --dry-run',
      'input list | PR3 | query | false | none | --node',
      'input show | PR2 | query | false | none | --node --key',
      'input add | PR3 | localMutation | true | none | --node --key --value-type --mode --label --description --required --dry-run',
      'input remove | PR3 | localMutation | true | none | --node --key --dry-run',
      'input set | PR1 | localMutation | true | none | --node --key --value --value-json --value-file --value-env --dry-run',
      'input ref | PR1 | localMutation | true | none | --node --key --from --dry-run',
      'input unset | PR2 | localMutation | true | none | --node --key --dry-run',
      'input available | PR2 | query | false | none | --node --key',
      'output list | PR3 | query | false | none | --node',
      'output add | PR3 | localMutation | true | none | --node --key --value-type --label --description --dry-run',
      'output remove | PR3 | localMutation | true | none | --node --key --dry-run',
      'tool list | PR3 | query | false | none | --tool-call',
      'tool attach | PR3 | localMutation | true | none | --tool-call --template --tool-node --id --position --dry-run',
      'tool detach | PR3 | localMutation | true | none | --tool-call --tool-node --dry-run',
      'container children | PR3 | query | false | none | --node',
      'validate | PR1 | query | false | none | ',
      'changeset plan | PR4 | artifact | false | none | --input --output',
      'changeset apply | PR4 | localMutation | true | checksum | --plan --dry-run --confirm'
    ]);
  });
});

describe('renderHelp', () => {
  it('derives global and command help from the registry', () => {
    const help = renderHelp();
    expect(help).toContain('template show');
    expect(help).toContain('input ref');
    expect(help).toContain('changeset plan');
    expect(help).toContain('changeset apply');
    expect(
      renderHelp(cliCommandRegistry.find((item) => item.path.join(' ') === 'build'))
    ).toContain('--output <value> (required)');
  });
});
