import { CliArgumentError, parseCliArgs } from '../src';
import { describe, expect, it } from 'vitest';

const parse = (argv: string[]) => parseCliArgs({ argv, cwd: '/tmp', env: { NODE_ENV: 'test' } });

describe('parseCliArgs', () => {
  it('allows global options after the command and resolves context', () => {
    const parsed = parse([
      'node',
      'add',
      '--node',
      'ai',
      '--template',
      'builtin:ai-chat',
      '--dir',
      './demo',
      '--format',
      'json',
      '--dry-run'
    ]);
    expect(parsed.context.dir).toBe('/tmp/demo');
    expect(parsed.context.format).toBe('json');
    expect(parsed.input.dryRun).toBe(true);
  });

  it.each([
    [['unknown'], 'Unknown command'],
    [['validate', '--output', 'x'], 'Option is not valid'],
    [['validate', '--format', 'yaml'], '--format must be'],
    [['node', 'show'], 'Command options are invalid'],
    [['node', 'show', '--missing'], 'Unknown option']
  ] as const)('rejects invalid arguments', (argv, message) => {
    expect(() => parse([...argv])).toThrowError(new RegExp(message));
  });

  it('enforces mutually exclusive value options', () => {
    expect(() =>
      parse([
        'input',
        'set',
        '--node',
        'ai',
        '--key',
        'model',
        '--value',
        'a',
        '--value-json',
        '"b"'
      ])
    ).toThrow(CliArgumentError);
  });
});
