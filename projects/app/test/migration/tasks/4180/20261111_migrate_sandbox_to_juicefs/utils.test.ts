import { execFile } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import { sanitizeMigrationErrorMessage } from '@/migration/tasks/4180/sandbox_migration_shared/env';
import {
  buildClearWorkspaceTenantFilesCommand,
  buildDualMountTarCopyCommand,
  buildSafeUntarGzToWorkspaceCommand,
  buildSafeUnzipToWorkspaceCommand,
  buildSealosRemotePackCommand,
  buildTarExcludeArgs,
  classifyLegacyV2MigrationSource,
  collectLegacyWorkspaceManifest,
  computeDeterministicV3ClaimName,
  normalizeExecdPermissionMode,
  syncLegacyWorkspaceManifestViaExecd,
  validateAndRewriteLegacySymlinkTarget
} from '@/migration/tasks/4180/20261111_migrate_sandbox_to_juicefs/utils';

const execFileAsync = promisify(execFile);

describe('20261111_migrate_sandbox_to_juicefs utils', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dir) => {
        await execFileAsync('chmod', ['-R', 'u+rwX', dir]).catch(() => undefined);
        await rm(dir, { recursive: true, force: true });
      })
    );
  });

  it('classifies all 9 legacy v2 statuses and archiving phases accurately', () => {
    expect(
      classifyLegacyV2MigrationSource({
        status: 'deleting',
        provider: 'opensandbox',
        storage: null,
        operation: null
      })
    ).toEqual({ kind: 'skip_deleting' });

    expect(
      classifyLegacyV2MigrationSource({
        status: 'legacyMigrating',
        provider: 'opensandbox',
        storage: null,
        operation: null
      })
    ).toEqual({ kind: 'fail_legacy_v1' });

    for (const status of ['archived', 'restoring'] as const) {
      expect(
        classifyLegacyV2MigrationSource({
          status,
          provider: 'sealosdevbox',
          storage: null,
          operation: null
        })
      ).toEqual({ kind: 's3_archive' });
    }

    expect(
      classifyLegacyV2MigrationSource({
        status: 'archiving',
        provider: 'opensandbox',
        storage: {
          volumes: [
            { name: 'workspace', claimName: 'fastgpt-session-old', mountPath: '/workspace' }
          ]
        },
        operation: { phase: 'archiveUploaded' }
      })
    ).toEqual({ kind: 's3_archive' });

    expect(
      classifyLegacyV2MigrationSource({
        status: 'archiving',
        provider: 'opensandbox',
        storage: {
          volumes: [
            { name: 'workspace', claimName: 'fastgpt-session-old', mountPath: '/workspace' }
          ]
        },
        operation: { phase: 'claimed' }
      })
    ).toEqual({ kind: 'opensandbox_volume', oldClaimName: 'fastgpt-session-old' });

    expect(
      classifyLegacyV2MigrationSource({
        status: 'stopped',
        provider: 'sealosdevbox',
        storage: null,
        operation: null
      })
    ).toEqual({ kind: 'sealos_devbox' });
  });

  it('computes deterministic v3 claimName and avoids colliding with oldClaimName', () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL = 'http://volume-manager.local:3000';
    const first = computeDeterministicV3ClaimName({
      v2ObjectId: '673000000000000000000001',
      sandboxId: 'app-123456'
    });
    const second = computeDeterministicV3ClaimName({
      v2ObjectId: '673000000000000000000001',
      sandboxId: 'app-123456'
    });
    expect(first).toBe(second);

    const nonColliding = computeDeterministicV3ClaimName({
      v2ObjectId: '673000000000000000000001',
      sandboxId: 'app-123456',
      oldClaimName: first
    });
    expect(nonColliding).not.toBe(first);
  });

  it('excludes system and archive temp entries while preserving top-level ./projects', () => {
    const excludes = buildTarExcludeArgs().join(' ');
    expect(excludes).toContain('./.fastgpt-sandbox-archive.zip');
    expect(excludes).toContain('./.config');
    expect(excludes).toContain('./.jfs*');
    expect(excludes).toContain('./lost+found');
    expect(excludes).not.toContain('./projects');
  });

  it('redacts tokens and URI passwords in migration error messages while preserving Python traceback tail', () => {
    const message = sanitizeMigrationErrorMessage(
      new Error(
        'Request failed with Authorization: Bearer super-secret-jwt-token and postgres://admin:dbpass@pg:5432/meta\n    at stackFrame'
      ),
      ['custom-secret-token']
    );
    expect(message).not.toContain('super-secret-jwt-token');
    expect(message).not.toContain('dbpass');
    expect(message).not.toContain('stackFrame');
    expect(message).toContain('[REDACTED]');

    const pythonTracebackMsg = sanitizeMigrationErrorMessage(
      new Error(
        'Migration container command failed (1): Traceback (most recent call last):\n  File "<string>", line 3, in <module>\n    raise ReadError("empty file")\ntarfile.ReadError: empty file'
      )
    );
    expect(pythonTracebackMsg).toContain('Migration container command failed (1)');
    expect(pythonTracebackMsg).toContain('tarfile.ReadError: empty file');
  });

  it('extracts valid zip entries, filters excluded files, preserves JuiceFS internals, and rejects Zip-Slip', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sandbox-mig-zip-'));
    tempDirs.push(root);
    const workspaceDir = join(root, 'workspace');
    await mkdir(workspaceDir, { recursive: true });
    // Simulate JuiceFS internal virtual marker & stale retry file
    await writeFile(join(workspaceDir, '.jfs.meta'), 'internal');
    await writeFile(join(workspaceDir, 'stale.txt'), 'old');

    const goodZip = join(root, 'good.zip');
    await execFileAsync('python3', [
      '-c',
      [
        'import sys, zipfile',
        'with zipfile.ZipFile(sys.argv[1], "w") as zf:',
        '    zf.writestr("sessions/chat-1/hello.txt", "world")',
        '    zf.writestr("sessions/chat-1/projects/keep.txt", "nested-ok")',
        '    zf.writestr("projects/skill-pkg/SKILL.md", "keep-top-projects")',
        '    zf.writestr(".venv/pyvenv.cfg", "home = /usr/bin")',
        '    zf.writestr(".fastgpt-sandbox-archive.zip", "temp")'
      ].join('\n'),
      goodZip
    ]);

    const cmd = buildSafeUnzipToWorkspaceCommand({
      zipPath: goodZip,
      targetMountPath: workspaceDir
    });
    await execFileAsync('sh', ['-c', cmd]);

    expect(await readFile(join(workspaceDir, 'sessions/chat-1/hello.txt'), 'utf-8')).toBe('world');
    expect(await readFile(join(workspaceDir, 'sessions/chat-1/projects/keep.txt'), 'utf-8')).toBe(
      'nested-ok'
    );
    expect(await readFile(join(workspaceDir, 'projects/skill-pkg/SKILL.md'), 'utf-8')).toBe(
      'keep-top-projects'
    );
    expect(await readFile(join(workspaceDir, '.venv/pyvenv.cfg'), 'utf-8')).toContain('/usr/bin');
    expect(await readFile(join(workspaceDir, '.jfs.meta'), 'utf-8')).toBe('internal');
    const topEntries = await readdir(workspaceDir);
    expect(topEntries).not.toContain('stale.txt');
    expect(topEntries).toContain('projects');
    expect(topEntries).not.toContain('.fastgpt-sandbox-archive.zip');

    // Reject Zip-Slip path traversal
    const evilZip = join(root, 'evil.zip');
    await execFileAsync('python3', [
      '-c',
      [
        'import sys, zipfile',
        'with zipfile.ZipFile(sys.argv[1], "w") as zf:',
        '    zf.writestr("../escaped.txt", "pwn")'
      ].join('\n'),
      evilZip
    ]);
    const evilCmd = buildSafeUnzipToWorkspaceCommand({
      zipPath: evilZip,
      targetMountPath: workspaceDir
    });
    await expect(execFileAsync('sh', ['-c', evilCmd])).rejects.toThrow(
      /Unsafe traversal zip entry/
    );
  });

  it('blocks multi-hop symlink chain escape, supports 0555 read-only dirs & 0444 duplicate entries, and cleans 0555 dirs on retry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sandbox-mig-zip-edge-'));
    tempDirs.push(root);
    const workspaceDir = join(root, 'workspace');
    await mkdir(join(workspaceDir, 'lost+found'), { recursive: true });
    await writeFile(join(workspaceDir, 'lost+found/ext4-marker'), 'keep');

    // 1. Zip with 0555 read-only directory BEFORE child 0444 file, duplicate 0444->0644 entry, nested .config, andprojects.json
    const edgeZip = join(root, 'edge.zip');
    await execFileAsync('python3', [
      '-c',
      [
        'import stat, sys, zipfile',
        'with zipfile.ZipFile(sys.argv[1], "w") as zf:',
        '    d = zipfile.ZipInfo("ro_pkg/")',
        '    d.create_system = 3',
        '    d.external_attr = (stat.S_IFDIR | 0o555) << 16',
        '    zf.writestr(d, "")',
        '    f = zipfile.ZipInfo("ro_pkg/mod.go")',
        '    f.create_system = 3',
        '    f.external_attr = (stat.S_IFREG | 0o444) << 16',
        '    zf.writestr(f, "package mod")',
        '    dup1 = zipfile.ZipInfo("dup.txt")',
        '    dup1.create_system = 3',
        '    dup1.external_attr = (stat.S_IFREG | 0o444) << 16',
        '    zf.writestr(dup1, "old")',
        '    dup2 = zipfile.ZipInfo("dup.txt")',
        '    dup2.create_system = 3',
        '    dup2.external_attr = (stat.S_IFREG | 0o644) << 16',
        '    zf.writestr(dup2, "new")',
        '    zf.writestr("myapp/.config/app.json", "{\\"ok\\":true}")',
        '    zf.writestr("projects.json", "{\\"count\\":1}")'
      ].join('\n'),
      edgeZip
    ]);

    await execFileAsync('sh', [
      '-c',
      buildSafeUnzipToWorkspaceCommand({
        zipPath: edgeZip,
        targetMountPath: workspaceDir
      })
    ]);

    expect(await readFile(join(workspaceDir, 'ro_pkg/mod.go'), 'utf-8')).toBe('package mod');
    expect(await readFile(join(workspaceDir, 'dup.txt'), 'utf-8')).toBe('new');
    expect(await readFile(join(workspaceDir, 'myapp/.config/app.json'), 'utf-8')).toBe(
      '{"ok":true}'
    );
    expect(await readFile(join(workspaceDir, 'projects.json'), 'utf-8')).toBe('{"count":1}');
    expect(await readFile(join(workspaceDir, 'lost+found/ext4-marker'), 'utf-8')).toBe('keep');
    expect((await stat(join(workspaceDir, 'ro_pkg'))).mode & 0o777).toBe(0o555);

    // Retry cleanup must wipe 0555 ro_pkg cleanly while keeping lost+found
    await execFileAsync('sh', ['-c', buildClearWorkspaceTenantFilesCommand(workspaceDir)]);
    expect(await readdir(workspaceDir)).toEqual(['lost+found']);

    // 2. 2-hop symlink chain attack (s1 -> ., s1/s2 -> .., s1/s2/outside_pwned.txt) MUST be blocked!
    const chainZip = join(root, 'chain.zip');
    const outsideVictim = join(root, 'outside_pwned.txt');
    await execFileAsync('python3', [
      '-c',
      [
        'import stat, sys, zipfile',
        'with zipfile.ZipFile(sys.argv[1], "w") as zf:',
        '    s1 = zipfile.ZipInfo("s1")',
        '    s1.create_system = 3',
        '    s1.external_attr = (stat.S_IFLNK | 0o777) << 16',
        '    zf.writestr(s1, ".")',
        '    s2 = zipfile.ZipInfo("s1/s2")',
        '    s2.create_system = 3',
        '    s2.external_attr = (stat.S_IFLNK | 0o777) << 16',
        '    zf.writestr(s2, "..")',
        '    zf.writestr("s1/s2/outside_pwned.txt", "PWNED")'
      ].join('\n'),
      chainZip
    ]);

    await expect(
      execFileAsync('sh', [
        '-c',
        buildSafeUnzipToWorkspaceCommand({
          zipPath: chainZip,
          targetMountPath: workspaceDir
        })
      ])
    ).rejects.toThrow(/Refusing to extract through symlink directory/);
    await expect(stat(outsideVictim)).rejects.toThrow();
  });

  it('handles dual-mount tar copy & Sealos pack/untar boundaries (nested .config, projects.json, special chars, 0755, symlinks, tar symlink-chain & FIFO rejection)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sandbox-mig-tar-edge-'));
    tempDirs.push(root);
    const srcDir = join(root, 'legacy');
    const appDst = join(root, 'dst-app');
    const sealosDst = join(root, 'dst-sealos');
    await mkdir(join(srcDir, '.config'), { recursive: true });
    await mkdir(join(srcDir, 'lost+found'), { recursive: true });
    await mkdir(join(srcDir, 'projects/subpkg'), { recursive: true });
    await mkdir(join(srcDir, 'myapp/.config'), { recursive: true });
    await mkdir(join(srcDir, 'sessions/chat-9/projects'), { recursive: true });
    await mkdir(join(srcDir, 'scripts'), { recursive: true });
    await mkdir(appDst, { recursive: true });
    await mkdir(sealosDst, { recursive: true });

    await writeFile(join(srcDir, '.config/jfs-internal'), 'drop');
    await writeFile(join(srcDir, 'lost+found/ext4'), 'drop');
    await writeFile(join(srcDir, 'projects/subpkg/helper.py'), 'skill-only');
    await writeFile(join(srcDir, 'projects.json'), '{"v":1}');
    await writeFile(join(srcDir, 'myapp/.config/settings.json'), '{"nested":true}');
    await writeFile(join(srcDir, 'sessions/chat-9/projects/keep.md'), 'session-proj');
    await writeFile(join(srcDir, '.env'), 'MODE=prod');
    await writeFile(join(srcDir, "report 'final' $1 [中文].md"), 'unicode-ok');
    await writeFile(join(srcDir, 'scripts/run.sh'), '#!/bin/sh\necho ok\n');
    await chmod(join(srcDir, 'scripts/run.sh'), 0o755);
    await execFileAsync('ln', ['-s', '../.env', join(srcDir, 'scripts/env-link')]);

    // 1. Dual-mount copy excludes .config & lost+found, keeps top-level projects, nested .config, projects.json, sessions/.../projects
    await execFileAsync('sh', [
      '-c',
      buildDualMountTarCopyCommand({
        legacyMountPath: srcDir,
        targetMountPath: appDst
      })
    ]);
    expect(await readFile(join(appDst, 'projects/subpkg/helper.py'), 'utf-8')).toBe('skill-only');
    expect(await readFile(join(appDst, 'myapp/.config/settings.json'), 'utf-8')).toBe(
      '{"nested":true}'
    );
    expect(await readFile(join(appDst, 'projects.json'), 'utf-8')).toBe('{"v":1}');
    expect(await readFile(join(appDst, 'sessions/chat-9/projects/keep.md'), 'utf-8')).toBe(
      'session-proj'
    );
    expect(await readFile(join(appDst, "report 'final' $1 [中文].md"), 'utf-8')).toBe('unicode-ok');
    expect((await stat(join(appDst, 'scripts/run.sh'))).mode & 0o111).not.toBe(0);
    expect((await lstat(join(appDst, 'scripts/env-link'))).isSymbolicLink()).toBe(true);
    expect(await readdir(appDst)).toContain('projects');
    expect(await readdir(appDst)).not.toContain('.config');
    expect(await readdir(appDst)).not.toContain('lost+found');

    // 2. Sealos remote pack + byte count + safe untar preserves top-level projects
    const tarGzPath = join(root, 'sealos.tar.gz');
    const { stdout: packOut } = await execFileAsync('sh', [
      '-c',
      buildSealosRemotePackCommand({
        workDirectory: srcDir,
        remoteTarPath: tarGzPath
      })
    ]);
    expect(Number(packOut.trim())).toBe((await stat(tarGzPath)).size);

    await execFileAsync('sh', [
      '-c',
      buildSafeUntarGzToWorkspaceCommand({
        tarGzPath,
        targetMountPath: sealosDst
      })
    ]);
    expect(await readFile(join(sealosDst, 'projects/subpkg/helper.py'), 'utf-8')).toBe(
      'skill-only'
    );
    expect(await readFile(join(sealosDst, 'myapp/.config/settings.json'), 'utf-8')).toBe(
      '{"nested":true}'
    );
    expect(await readFile(join(sealosDst, "report 'final' $1 [中文].md"), 'utf-8')).toBe(
      'unicode-ok'
    );

    // 3. Sealos pack on directory containing ONLY lost+found & .config outputs EMPTY_WORKDIR, while projects-only is non-empty
    const sysOnlyDir = join(root, 'sys-only');
    await mkdir(join(sysOnlyDir, 'lost+found'), { recursive: true });
    await mkdir(join(sysOnlyDir, '.config'), { recursive: true });
    const { stdout: emptyPackOut } = await execFileAsync('sh', [
      '-c',
      buildSealosRemotePackCommand({
        workDirectory: sysOnlyDir,
        remoteTarPath: join(root, 'unused.tar.gz')
      })
    ]);
    expect(emptyPackOut.trim()).toBe('EMPTY_WORKDIR');

    await mkdir(join(sysOnlyDir, 'projects'), { recursive: true });
    await writeFile(join(sysOnlyDir, 'projects/user.txt'), 'keep');
    const projectsOnlyTar = join(root, 'projects-only.tar.gz');
    const { stdout: projectsPackOut } = await execFileAsync('sh', [
      '-c',
      buildSealosRemotePackCommand({
        workDirectory: sysOnlyDir,
        remoteTarPath: projectsOnlyTar
      })
    ]);
    expect(Number(projectsPackOut.trim())).toBeGreaterThan(0);

    // 5. Reject 2-hop symlink chain & special FIFO member in tar.gz
    const evilTar = join(root, 'evil-chain.tar.gz');
    await execFileAsync('python3', [
      '-c',
      [
        'import io, sys, tarfile',
        'with tarfile.open(sys.argv[1], "w:gz") as tf:',
        '    s1 = tarfile.TarInfo("s1")',
        '    s1.type = tarfile.SYMTYPE',
        '    s1.linkname = "."',
        '    tf.addfile(s1)',
        '    s2 = tarfile.TarInfo("s1/s2")',
        '    s2.type = tarfile.SYMTYPE',
        '    s2.linkname = ".."',
        '    tf.addfile(s2)'
      ].join('\n'),
      evilTar
    ]);
    await expect(
      execFileAsync('sh', [
        '-c',
        buildSafeUntarGzToWorkspaceCommand({ tarGzPath: evilTar, targetMountPath: sealosDst })
      ])
    ).rejects.toThrow(/Refusing to extract through link directory/);

    const fifoTar = join(root, 'fifo.tar.gz');
    await execFileAsync('python3', [
      '-c',
      [
        'import sys, tarfile',
        'with tarfile.open(sys.argv[1], "w:gz") as tf:',
        '    f = tarfile.TarInfo("named.pipe")',
        '    f.type = tarfile.FIFOTYPE',
        '    tf.addfile(f)'
      ].join('\n'),
      fifoTar
    ]);
    await expect(
      execFileAsync('sh', [
        '-c',
        buildSafeUntarGzToWorkspaceCommand({ tarGzPath: fifoTar, targetMountPath: sealosDst })
      ])
    ).rejects.toThrow(/Unsupported special tar entry/);
  });

  it('preserves Python .venv leaf symlinks to /usr/bin/python3 in zip & tar.gz, rewrites Devbox oldWorkDirectory symlinks, and rejects cross-workspace tar hardlinks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sandbox-mig-venv-'));
    tempDirs.push(root);
    const zipDst = join(root, 'zip-dst');
    const tarDst = join(root, 'tar-dst');
    await mkdir(zipDst, { recursive: true });
    await mkdir(tarDst, { recursive: true });

    // 1. S3 package.zip with .venv/bin/python3 -> /usr/bin/python3 and .venv/bin/python -> python3
    const venvZip = join(root, 'venv.zip');
    await execFileAsync('python3', [
      '-c',
      [
        'import stat, sys, zipfile',
        'with zipfile.ZipFile(sys.argv[1], "w") as zf:',
        '    zf.writestr(".venv/pyvenv.cfg", "home = /usr/bin\\n")',
        '    p3 = zipfile.ZipInfo(".venv/bin/python3")',
        '    p3.create_system = 3',
        '    p3.external_attr = (stat.S_IFLNK | 0o777) << 16',
        '    zf.writestr(p3, "/usr/bin/python3")',
        '    p = zipfile.ZipInfo(".venv/bin/python")',
        '    p.create_system = 3',
        '    p.external_attr = (stat.S_IFLNK | 0o777) << 16',
        '    zf.writestr(p, "python3")'
      ].join('\n'),
      venvZip
    ]);

    await execFileAsync('sh', [
      '-c',
      buildSafeUnzipToWorkspaceCommand({
        zipPath: venvZip,
        targetMountPath: zipDst
      })
    ]);
    expect(await readlink(join(zipDst, '.venv/bin/python3'))).toBe('/usr/bin/python3');
    expect(await readlink(join(zipDst, '.venv/bin/python'))).toBe('python3');

    // 2. Sealos Devbox tar.gz with .venv/bin/python3 -> /usr/bin/python3 and intra-workspace /home/devbox/workspace/shared/lib.py
    const devboxTar = join(root, 'devbox-venv.tar.gz');
    await execFileAsync('python3', [
      '-c',
      [
        'import io, sys, tarfile',
        'with tarfile.open(sys.argv[1], "w:gz") as tf:',
        '    data = b"print(42)\\n"',
        '    reg = tarfile.TarInfo("shared/lib.py")',
        '    reg.size = len(data)',
        '    tf.addfile(reg, io.BytesIO(data))',
        '    p3 = tarfile.TarInfo(".venv/bin/python3")',
        '    p3.type = tarfile.SYMTYPE',
        '    p3.linkname = "/usr/bin/python3"',
        '    tf.addfile(p3)',
        '    ws_link = tarfile.TarInfo("sessions/chat-1/lib_link.py")',
        '    ws_link.type = tarfile.SYMTYPE',
        '    ws_link.linkname = "/home/devbox/workspace/shared/lib.py"',
        '    tf.addfile(ws_link)'
      ].join('\n'),
      devboxTar
    ]);

    await execFileAsync('sh', [
      '-c',
      buildSafeUntarGzToWorkspaceCommand({
        tarGzPath: devboxTar,
        targetMountPath: tarDst,
        oldWorkDirectory: '/home/devbox/workspace'
      })
    ]);
    expect(await readlink(join(tarDst, '.venv/bin/python3'))).toBe('/usr/bin/python3');
    expect(await readlink(join(tarDst, 'sessions/chat-1/lib_link.py'))).toBe(
      `${await realpath(tarDst)}/shared/lib.py`
    );
    expect(await readFile(join(tarDst, 'sessions/chat-1/lib_link.py'), 'utf-8')).toBe(
      'print(42)\n'
    );

    // 3. Reject tar hardlinks pointing outside workspace (both absolute and relative ..)
    const evilHardlinkTar = join(root, 'evil-hardlink.tar.gz');
    await execFileAsync('python3', [
      '-c',
      [
        'import sys, tarfile',
        'with tarfile.open(sys.argv[1], "w:gz") as tf:',
        '    hl = tarfile.TarInfo("leak.txt")',
        '    hl.type = tarfile.LNKTYPE',
        '    hl.linkname = "/etc/passwd"',
        '    tf.addfile(hl)'
      ].join('\n'),
      evilHardlinkTar
    ]);
    await expect(
      execFileAsync('sh', [
        '-c',
        buildSafeUntarGzToWorkspaceCommand({
          tarGzPath: evilHardlinkTar,
          targetMountPath: tarDst
        })
      ])
    ).rejects.toThrow(/Unsafe absolute link in tar/);

    const evilRelHardlinkTar = join(root, 'evil-rel-hardlink.tar.gz');
    await execFileAsync('python3', [
      '-c',
      [
        'import sys, tarfile',
        'with tarfile.open(sys.argv[1], "w:gz") as tf:',
        '    hl = tarfile.TarInfo("leak2.txt")',
        '    hl.type = tarfile.LNKTYPE',
        '    hl.linkname = "../outside.txt"',
        '    tf.addfile(hl)'
      ].join('\n'),
      evilRelHardlinkTar
    ]);
    await expect(
      execFileAsync('sh', [
        '-c',
        buildSafeUntarGzToWorkspaceCommand({
          tarGzPath: evilRelHardlinkTar,
          targetMountPath: tarDst
        })
      ])
    ).rejects.toThrow(/Link escapes workspace/);
  });

  it('fails closed instead of silently producing an empty archive when legacy directory is missing or find encounters a read error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sandbox-mig-find-err-'));
    tempDirs.push(root);
    const dstDir = join(root, 'dst');
    await mkdir(dstDir, { recursive: true });
    await writeFile(join(dstDir, 'sentinel.txt'), 'do-not-wipe');

    // 1. Missing legacy mount path must exit non-zero before wiping target workspace
    await expect(
      execFileAsync('sh', [
        '-c',
        buildDualMountTarCopyCommand({
          legacyMountPath: join(root, 'missing-mount'),
          targetMountPath: dstDir
        })
      ])
    ).rejects.toThrow(/Legacy workspace mount directory missing/);
    expect(await readFile(join(dstDir, 'sentinel.txt'), 'utf-8')).toBe('do-not-wipe');

    // 2. When running as non-root, an execute-only workspace directory (0111, simulating 0711 owned by root)
    //    allows `cd` but causes `find . -mindepth 1` to exit 1, which must NOT be swallowed by a shell pipeline!
    if (typeof process.getuid === 'function' && process.getuid() !== 0) {
      const unreadableDir = join(root, 'unreadable-legacy');
      await mkdir(join(unreadableDir, 'secret-sub'), { recursive: true });
      await writeFile(join(unreadableDir, 'secret-sub/data.txt'), 'important');
      await chmod(unreadableDir, 0o111);

      try {
        await expect(
          execFileAsync('sh', [
            '-c',
            buildDualMountTarCopyCommand({
              legacyMountPath: unreadableDir,
              targetMountPath: dstDir
            })
          ])
        ).rejects.toThrow();
        expect(await readFile(join(dstDir, 'sentinel.txt'), 'utf-8')).toBe('do-not-wipe');

        await expect(
          execFileAsync('sh', [
            '-c',
            buildSealosRemotePackCommand({
              workDirectory: unreadableDir,
              remoteTarPath: join(root, 'should-not-exist.tar.gz')
            })
          ])
        ).rejects.toThrow();
      } finally {
        await chmod(unreadableDir, 0o755);
      }
    }
  });

  it('collects and syncs cross-runtime OpenSandbox workspaces via execd with excludes, deep traversal, stream/batch split, symlinks, and deferred dir modes', async () => {
    expect(normalizeExecdPermissionMode(755, 644)).toBe(755);
    expect(normalizeExecdPermissionMode(2750, 755)).toBe(750);
    expect(normalizeExecdPermissionMode(493, 755)).toBe(755); // rejects decimal 0o755 (contains digit '9')
    expect(
      validateAndRewriteLegacySymlinkTarget({
        relPath: 'sessions/chat-1/link.py',
        target: '/legacy-workspace/shared/lib.py'
      })
    ).toBe('/workspace/shared/lib.py');
    expect(
      validateAndRewriteLegacySymlinkTarget({
        relPath: '.venv/bin/python3',
        target: '/usr/bin/python3'
      })
    ).toBe('/usr/bin/python3');
    expect(() =>
      validateAndRewriteLegacySymlinkTarget({
        relPath: 'sessions/escape',
        target: '../../etc/passwd'
      })
    ).toThrow(/Link escapes workspace/);

    const listDirectory = async (path: string, depth?: number) => {
      if (path === '/legacy-workspace' && depth === 1) {
        return [
          { path: '/legacy-workspace/.config', type: 'directory' as const, mode: 755 },
          { path: '/legacy-workspace/.jfs.meta', type: 'file' as const, size: 10, mode: 644 },
          { path: '/legacy-workspace/lost+found', type: 'directory' as const, mode: 700 },
          { path: '/legacy-workspace/projects', type: 'directory' as const, mode: 755 },
          { path: '/legacy-workspace/projects.json', type: 'file' as const, size: 9, mode: 644 },
          { path: '/legacy-workspace/ro_pkg', type: 'directory' as const, mode: 555 },
          { path: '/legacy-workspace/deep', type: 'directory' as const, mode: 755 },
          { path: '/legacy-workspace/big.bin', type: 'file' as const, size: 300 * 1024, mode: 640 }
        ];
      }
      if (path === '/legacy-workspace/ro_pkg') {
        return [
          { path: '/legacy-workspace/ro_pkg/sub', type: 'directory' as const, mode: 500 },
          {
            path: '/legacy-workspace/ro_pkg/sub/mod.go',
            type: 'file' as const,
            size: 11,
            mode: 444
          },
          { path: '/legacy-workspace/ro_pkg/env-link', type: 'symlink' as const, mode: 777 }
        ];
      }
      if (path === '/legacy-workspace/deep') {
        return [
          { path: '/legacy-workspace/deep/1/2/3/4/5/6/7/8', type: 'directory' as const, mode: 755 }
        ];
      }
      if (path === '/legacy-workspace/deep/1/2/3/4/5/6/7/8') {
        return [
          {
            path: '/legacy-workspace/deep/1/2/3/4/5/6/7/8/leaf.txt',
            type: 'file' as const,
            size: 4,
            mode: 644
          }
        ];
      }
      if (path === '/legacy-workspace/projects') {
        return [
          {
            path: '/legacy-workspace/projects/user-app.py',
            type: 'file' as const,
            size: 14,
            mode: 644
          }
        ];
      }
      return [];
    };

    const legacyExec = async (command: string) => {
      expect(command).toContain('os.readlink');
      return {
        stdout: JSON.stringify([Buffer.from('/legacy-workspace/projects.json').toString('base64')]),
        stderr: ''
      };
    };

    const manifest = await collectLegacyWorkspaceManifest({
      legacyOps: { listDirectory, exec: legacyExec }
    });
    expect(manifest.isEmpty).toBe(false);
    expect(manifest.files.map((f) => f.relPath)).toEqual([
      'projects.json',
      'big.bin',
      'projects/user-app.py',
      'ro_pkg/sub/mod.go',
      'deep/1/2/3/4/5/6/7/8/leaf.txt'
    ]);
    expect(manifest.symlinks).toEqual([
      {
        relPath: 'ro_pkg/env-link',
        sourcePath: '/legacy-workspace/ro_pkg/env-link',
        targetPath: '/workspace/ro_pkg/env-link',
        linkTarget: '/workspace/projects.json'
      }
    ]);

    const fileContents: Record<string, Uint8Array> = {
      '/legacy-workspace/projects.json': new TextEncoder().encode('{"ok":1}\n'),
      '/legacy-workspace/projects/user-app.py': new TextEncoder().encode('print("proj")\n'),
      '/legacy-workspace/ro_pkg/sub/mod.go': new TextEncoder().encode('package mod'),
      '/legacy-workspace/deep/1/2/3/4/5/6/7/8/leaf.txt': new TextEncoder().encode('leaf'),
      '/legacy-workspace/big.bin': new Uint8Array(300 * 1024).fill(7)
    };
    const createdDirs: Array<Array<{ path: string; mode?: number }>> = [];
    const uploadedFiles: Array<{ path: string; bytes: Uint8Array; mode?: number }> = [];
    const appliedPerms: Array<Array<{ path: string; mode: number }>> = [];
    const targetExecCommands: string[] = [];

    await syncLegacyWorkspaceManifestViaExecd({
      manifest,
      legacyOps: {
        openFileStream: (sourcePath) =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(fileContents[sourcePath]);
              controller.close();
            }
          })
      },
      targetOps: {
        exec: async (cmd) => {
          targetExecCommands.push(cmd);
          return { stdout: '', stderr: '' };
        },
        uploadStream: async (path, stream, mode) => {
          const reader = stream.getReader();
          const chunks: Uint8Array[] = [];
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
          uploadedFiles.push({
            path,
            bytes: Buffer.concat(chunks),
            mode
          });
        },
        createDirectories: async (entries) => {
          createdDirs.push(entries);
        },
        setPermissions: async (entries) => {
          appliedPerms.push(entries);
        }
      }
    });

    // Dirs created writable (755) first; all files streamed uniformly with preserved modes; 500 before 555 in setPermissions
    expect(createdDirs.flat().every((d) => d.mode === 755)).toBe(true);
    expect(uploadedFiles).toEqual(
      expect.arrayContaining([
        {
          path: '/workspace/projects.json',
          bytes: Buffer.from(fileContents['/legacy-workspace/projects.json']),
          mode: 644
        },
        {
          path: '/workspace/ro_pkg/sub/mod.go',
          bytes: Buffer.from(fileContents['/legacy-workspace/ro_pkg/sub/mod.go']),
          mode: 444
        },
        {
          path: '/workspace/deep/1/2/3/4/5/6/7/8/leaf.txt',
          bytes: Buffer.from(fileContents['/legacy-workspace/deep/1/2/3/4/5/6/7/8/leaf.txt']),
          mode: 644
        },
        {
          path: '/workspace/projects/user-app.py',
          bytes: Buffer.from(fileContents['/legacy-workspace/projects/user-app.py']),
          mode: 644
        },
        {
          path: '/workspace/big.bin',
          bytes: Buffer.from(fileContents['/legacy-workspace/big.bin']),
          mode: 640
        }
      ])
    );
    expect(uploadedFiles).toHaveLength(5);
    expect(targetExecCommands.length).toBe(2); // clear workspace + create symlinks
    expect(targetExecCommands[1]).toContain('os.symlink');
    expect(appliedPerms).toEqual([
      [
        { path: '/workspace/ro_pkg/sub', mode: 500 },
        { path: '/workspace/ro_pkg', mode: 555 }
      ]
    ]);

    // Empty when only excluded top-level system/jfs dirs exist, and fail closed on special entries or symlink-ancestor traversal
    const emptyManifest = await collectLegacyWorkspaceManifest({
      legacyOps: {
        listDirectory: async () => [
          { path: '/legacy-workspace/.jfs.config', type: 'file', size: 1, mode: 644 },
          { path: '/legacy-workspace/.config', type: 'directory', mode: 755 }
        ],
        exec: async () => ({ stdout: '[]', stderr: '' })
      }
    });
    expect(emptyManifest.isEmpty).toBe(true);

    await expect(
      collectLegacyWorkspaceManifest({
        legacyOps: {
          listDirectory: async () => [{ path: '/legacy-workspace/fifo', type: 'other', mode: 644 }],
          exec: async () => ({ stdout: '[]', stderr: '' })
        }
      })
    ).rejects.toThrow(/Unsupported special filesystem entry/);

    await expect(
      collectLegacyWorkspaceManifest({
        legacyOps: {
          listDirectory: async (path) =>
            path === '/legacy-workspace'
              ? [
                  { path: '/legacy-workspace/s1', type: 'symlink', mode: 777 },
                  { path: '/legacy-workspace/s1', type: 'directory', mode: 755 }
                ]
              : [],
          exec: async () => ({
            stdout: JSON.stringify([Buffer.from('.').toString('base64')]),
            stderr: ''
          })
        }
      })
    ).resolves.toMatchObject({ isEmpty: false });

    await expect(
      collectLegacyWorkspaceManifest({
        legacyOps: {
          listDirectory: async (path, depth) =>
            path === '/legacy-workspace' && depth === 1
              ? [{ path: '/legacy-workspace/dir', type: 'directory', mode: 755 }]
              : [
                  { path: '/legacy-workspace/dir/s1', type: 'symlink', mode: 777 },
                  { path: '/legacy-workspace/dir/s1/pwn.txt', type: 'file', size: 1, mode: 644 }
                ],
          exec: async () => ({ stdout: '[]', stderr: '' })
        }
      })
    ).rejects.toThrow(/Refusing to copy through link directory/);
  });
});
