import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = join(packageRoot, 'dist', 'cli.js');
const workspace = await mkdtemp(join(tmpdir(), 'workflow-cli-bin-'));
const workflowDir = join(workspace, 'demo');

const invoke = (args, input) => {
  const result = spawnSync(process.execPath, [cliPath, ...args, '--format', 'json'], {
    cwd: workspace,
    env: { ...process.env, NODE_ENV: 'test' },
    input,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
};

try {
  invoke(['init', '--dir', workflowDir, '--name', 'Bin smoke']);
  invoke([
    'node',
    'add',
    '--dir',
    workflowDir,
    '--node',
    'ai',
    '--name',
    'CLI AI',
    '--template',
    'builtin:ai-chat',
    '--after',
    'start@next'
  ]);
  const prompt = 'Prompt only from stdin';
  const mutation = invoke(
    [
      'input',
      'set',
      '--dir',
      workflowDir,
      '--node',
      'ai',
      '--key',
      'systemPrompt',
      '--value-file',
      '-'
    ],
    prompt
  );
  assert.equal(JSON.stringify(mutation).includes(prompt), false);
  assert.equal(invoke(['validate', '--dir', workflowDir]).result.valid, true);

  const outputPath = join(workspace, 'workflow.generated.json');
  invoke(['build', '--dir', workflowDir, '--output', outputPath]);
  const workflow = JSON.parse(await readFile(outputPath, 'utf8'));
  assert.equal(workflow.nodes.find((node) => node.nodeId === 'ai').name, 'CLI AI');
  assert.equal(workflow.edges[0].sourceHandle, 'start-source-right');

  const descriptor = invoke([
    'template',
    'show',
    '--template',
    'builtin:ai-chat',
    '--locale',
    'zh-CN'
  ]).result;
  assert.equal(descriptor.name, 'AI 对话');
  assert.equal(JSON.stringify(descriptor).includes('workflow:cli.input'), false);
  process.stdout.write('workflow-cli built bin smoke passed\n');
} finally {
  await rm(workspace, { recursive: true, force: true });
}
