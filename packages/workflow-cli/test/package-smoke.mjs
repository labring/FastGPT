import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = await mkdtemp(join(tmpdir(), 'workflow-cli-package-'));
const packDirectory = join(workspace, 'pack');
const previousSourceDirectory = join(workspace, 'previous-source');
const previousPackDirectory = join(workspace, 'previous-pack');
const installDirectory = join(workspace, 'install');
const workflowDirectory = join(workspace, 'workflow');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: packageRoot,
    env: { ...process.env, NODE_ENV: 'test' },
    encoding: 'utf8',
    ...options
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
};

try {
  await mkdir(packDirectory, { recursive: true });
  run('pnpm', ['pack', '--pack-destination', packDirectory]);
  const tarballName = (await readdir(packDirectory)).find((file) => file.endsWith('.tgz'));
  assert.ok(tarballName);
  const tarballPath = join(packDirectory, tarballName);

  await mkdir(previousSourceDirectory, { recursive: true });
  await mkdir(previousPackDirectory, { recursive: true });
  run('tar', ['-xzf', tarballPath, '-C', previousSourceDirectory]);
  const previousPackageRoot = join(previousSourceDirectory, 'package');
  const previousPackageJsonPath = join(previousPackageRoot, 'package.json');
  const previousPackageJson = JSON.parse(await readFile(previousPackageJsonPath, 'utf8'));
  previousPackageJson.version = '0.2.0-beta.0';
  await writeFile(previousPackageJsonPath, `${JSON.stringify(previousPackageJson, null, 2)}\n`);
  const previousDistDirectory = join(previousPackageRoot, 'dist');
  for (const file of await readdir(previousDistDirectory)) {
    if (!file.endsWith('.js')) continue;
    const filePath = join(previousDistDirectory, file);
    const content = await readFile(filePath, 'utf8');
    await writeFile(filePath, content.replaceAll('0.2.0-beta.2', '0.2.0-beta.0'));
  }
  run('npm', ['pack', '--pack-destination', previousPackDirectory], {
    cwd: previousPackageRoot
  });
  const previousTarballName = (await readdir(previousPackDirectory)).find((file) =>
    file.endsWith('.tgz')
  );
  assert.ok(previousTarballName);
  const previousTarballPath = join(previousPackDirectory, previousTarballName);

  const install = (packagePath) =>
    run('npm', [
      'install',
      '--prefix',
      installDirectory,
      '--ignore-scripts',
      '--offline',
      packagePath
    ]);

  const binPath = join(installDirectory, 'node_modules', '.bin', 'fastgpt-workflow');
  install(previousTarballPath);
  assert.equal(run(binPath, ['--version']), '0.2.0-beta.0');
  run(binPath, ['init', '--dir', workflowDirectory, '--format', 'json']);

  install(tarballPath);
  assert.equal(run(binPath, ['--version']), '0.2.0-beta.2');
  const inspected = JSON.parse(
    run(binPath, ['inspect', '--dir', workflowDirectory, '--format', 'json'])
  );
  assert.match(inspected.checksum, /^sha256:[a-f0-9]{64}$/);

  install(previousTarballPath);
  assert.equal(run(binPath, ['--version']), '0.2.0-beta.0');
  JSON.parse(run(binPath, ['inspect', '--dir', workflowDirectory, '--format', 'json']));

  install(tarballPath);
  assert.equal(run(binPath, ['--version']), '0.2.0-beta.2');
  process.stdout.write('workflow-cli package install, upgrade and rollback smoke passed\n');
} finally {
  await rm(workspace, { recursive: true, force: true });
}
