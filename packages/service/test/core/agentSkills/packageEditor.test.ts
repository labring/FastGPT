import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  validatePackagePath,
  listZipDirectory,
  readZipFile,
  mutateZip,
  zipWriteText,
  zipWriteBinary,
  zipDeleteRecursive,
  zipRename,
  zipMkdir,
  withSkillEditLock
} from '@fastgpt/service/core/agentSkills/packageEditor';

async function buildFixtureZip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('skill-a/SKILL.md', '# A');
  zip.file('skill-a/scripts/run.sh', 'echo hi');
  zip.file('skill-a/scripts/lib/util.py', 'pass');
  zip.file('skill-a/assets/logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  zip.folder('skill-a/empty-dir');
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('packageEditor.validatePackagePath', () => {
  it('rejects absolute paths', () => {
    expect(() => validatePackagePath('/foo')).toThrow();
  });
  it('rejects backslash', () => {
    expect(() => validatePackagePath('foo\\bar')).toThrow();
  });
  it('rejects parent traversal segment', () => {
    expect(() => validatePackagePath('foo/../bar')).toThrow();
    expect(() => validatePackagePath('../foo')).toThrow();
  });
  it('allows root only when allowRoot=true', () => {
    expect(() => validatePackagePath('.')).toThrow();
    expect(validatePackagePath('.', { allowRoot: true })).toBe('');
    expect(validatePackagePath('', { allowRoot: true })).toBe('');
  });
  it('strips trailing slash', () => {
    expect(validatePackagePath('foo/bar/')).toBe('foo/bar');
  });
  it('accepts normal relative paths', () => {
    expect(validatePackagePath('skill-a/SKILL.md')).toBe('skill-a/SKILL.md');
  });
});

describe('packageEditor.listZipDirectory', () => {
  it('lists root level', async () => {
    const buf = await buildFixtureZip();
    const zip = await JSZip.loadAsync(buf);
    const items = listZipDirectory(zip, '');
    expect(items.map((i) => i.name)).toEqual(['skill-a']);
    expect(items[0].type).toBe('directory');
  });

  it('lists files and dirs at given path, sorted dir-first', async () => {
    const buf = await buildFixtureZip();
    const zip = await JSZip.loadAsync(buf);
    const items = listZipDirectory(zip, 'skill-a');
    expect(items.map((i) => `${i.type}:${i.name}`)).toEqual([
      'directory:assets',
      'directory:empty-dir',
      'directory:scripts',
      'file:SKILL.md'
    ]);
  });

  it('detects implicit directories (no explicit folder entry)', async () => {
    const z = new JSZip();
    z.file('a/b/c.txt', 'x');
    const items = listZipDirectory(z, 'a');
    expect(items).toEqual([{ name: 'b', path: 'a/b', type: 'directory' }]);
  });

  it('returns size for files', async () => {
    const buf = await buildFixtureZip();
    const zip = await JSZip.loadAsync(buf);
    const items = listZipDirectory(zip, 'skill-a');
    const skillMd = items.find((i) => i.name === 'SKILL.md');
    expect(skillMd?.size).toBe(3);
  });
});

describe('packageEditor.readZipFile', () => {
  it('returns buffer for existing file', async () => {
    const buf = await buildFixtureZip();
    const zip = await JSZip.loadAsync(buf);
    const content = await readZipFile(zip, 'skill-a/SKILL.md');
    expect(content?.toString('utf-8')).toBe('# A');
  });
  it('returns null for missing file', async () => {
    const buf = await buildFixtureZip();
    const zip = await JSZip.loadAsync(buf);
    expect(await readZipFile(zip, 'skill-a/nope.txt')).toBeNull();
  });
});

describe('packageEditor.mutateZip + zipWriteText/Binary', () => {
  it('roundtrips a text write', async () => {
    const buf = await buildFixtureZip();
    const newBuf = await mutateZip(buf, (zip) => {
      zipWriteText(zip, 'skill-a/SKILL.md', '# updated');
    });
    const reloaded = await JSZip.loadAsync(newBuf);
    expect(await reloaded.file('skill-a/SKILL.md')?.async('string')).toBe('# updated');
  });
  it('writes a new binary file', async () => {
    const buf = await buildFixtureZip();
    const newBuf = await mutateZip(buf, (zip) => {
      zipWriteBinary(zip, 'skill-a/assets/new.bin', Buffer.from([1, 2, 3]));
    });
    const reloaded = await JSZip.loadAsync(newBuf);
    const out = await reloaded.file('skill-a/assets/new.bin')?.async('nodebuffer');
    expect(out).toEqual(Buffer.from([1, 2, 3]));
  });
});

describe('packageEditor.zipDeleteRecursive', () => {
  it('deletes single file', async () => {
    const buf = await buildFixtureZip();
    const newBuf = await mutateZip(buf, (zip) => {
      zipDeleteRecursive(zip, 'skill-a/SKILL.md');
    });
    const reloaded = await JSZip.loadAsync(newBuf);
    expect(reloaded.file('skill-a/SKILL.md')).toBeNull();
    expect(reloaded.file('skill-a/scripts/run.sh')).not.toBeNull();
  });

  it('deletes whole directory subtree', async () => {
    const buf = await buildFixtureZip();
    const newBuf = await mutateZip(buf, (zip) => {
      zipDeleteRecursive(zip, 'skill-a/scripts');
    });
    const reloaded = await JSZip.loadAsync(newBuf);
    expect(reloaded.file('skill-a/scripts/run.sh')).toBeNull();
    expect(reloaded.file('skill-a/scripts/lib/util.py')).toBeNull();
    expect(reloaded.file('skill-a/SKILL.md')).not.toBeNull();
  });

  it('no-op for missing path', async () => {
    const buf = await buildFixtureZip();
    const newBuf = await mutateZip(buf, (zip) => {
      zipDeleteRecursive(zip, 'skill-a/nope');
    });
    const reloaded = await JSZip.loadAsync(newBuf);
    expect(reloaded.file('skill-a/SKILL.md')).not.toBeNull();
  });
});

describe('packageEditor.zipRename', () => {
  it('renames a file (preserves content)', async () => {
    const buf = await buildFixtureZip();
    const newBuf = await mutateZip(buf, (zip) =>
      zipRename(zip, 'skill-a/SKILL.md', 'skill-a/README.md')
    );
    const reloaded = await JSZip.loadAsync(newBuf);
    expect(reloaded.file('skill-a/SKILL.md')).toBeNull();
    expect(await reloaded.file('skill-a/README.md')?.async('string')).toBe('# A');
  });

  it('renames a directory (preserves children)', async () => {
    const buf = await buildFixtureZip();
    const newBuf = await mutateZip(buf, (zip) => zipRename(zip, 'skill-a/scripts', 'skill-a/bin'));
    const reloaded = await JSZip.loadAsync(newBuf);
    expect(reloaded.file('skill-a/scripts/run.sh')).toBeNull();
    expect(reloaded.file('skill-a/scripts/lib/util.py')).toBeNull();
    expect(await reloaded.file('skill-a/bin/run.sh')?.async('string')).toBe('echo hi');
    expect(await reloaded.file('skill-a/bin/lib/util.py')?.async('string')).toBe('pass');
  });

  it('throws when source missing', async () => {
    const buf = await buildFixtureZip();
    await expect(
      mutateZip(buf, (zip) => zipRename(zip, 'skill-a/nope', 'skill-a/other'))
    ).rejects.toThrow(/Entry not found/);
  });

  it('no-op when from === to', async () => {
    const buf = await buildFixtureZip();
    const newBuf = await mutateZip(buf, (zip) =>
      zipRename(zip, 'skill-a/SKILL.md', 'skill-a/SKILL.md')
    );
    const reloaded = await JSZip.loadAsync(newBuf);
    expect(await reloaded.file('skill-a/SKILL.md')?.async('string')).toBe('# A');
  });
});

describe('packageEditor.zipMkdir', () => {
  it('creates an explicit folder entry', async () => {
    const buf = await buildFixtureZip();
    const newBuf = await mutateZip(buf, (zip) => zipMkdir(zip, 'skill-a/new-dir'));
    const reloaded = await JSZip.loadAsync(newBuf);
    expect(reloaded.files['skill-a/new-dir/']?.dir).toBe(true);
  });
});

describe('packageEditor.withSkillEditLock', () => {
  it('serializes concurrent calls for the same skillId', async () => {
    const order: string[] = [];
    const a = withSkillEditLock('s1', async () => {
      order.push('a-start');
      await new Promise((r) => setTimeout(r, 30));
      order.push('a-end');
      return 'a';
    });
    // Give a a microtask to register first
    await Promise.resolve();
    const b = withSkillEditLock('s1', async () => {
      order.push('b-start');
      await new Promise((r) => setTimeout(r, 10));
      order.push('b-end');
      return 'b';
    });
    await Promise.all([a, b]);
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end']);
  });

  it('does not serialize across different skillIds', async () => {
    const order: string[] = [];
    const a = withSkillEditLock('s1', async () => {
      order.push('s1-start');
      await new Promise((r) => setTimeout(r, 30));
      order.push('s1-end');
    });
    const b = withSkillEditLock('s2', async () => {
      order.push('s2-start');
      await new Promise((r) => setTimeout(r, 10));
      order.push('s2-end');
    });
    await Promise.all([a, b]);
    // s2 should finish before s1
    expect(order.indexOf('s2-end')).toBeLessThan(order.indexOf('s1-end'));
  });

  it('releases lock even when fn throws', async () => {
    await expect(
      withSkillEditLock('s3', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    // Next call should still run
    const v = await withSkillEditLock('s3', async () => 42);
    expect(v).toBe(42);
  });
});
