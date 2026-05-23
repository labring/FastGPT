import { describe, expect, it } from 'vitest';

import {
  getSupportedArchiveFormat,
  findSkillMdKey,
  getRootPrefix,
  stripRootPrefix,
  isIgnoredSystemArchiveEntry,
  normalizeSkillWorkspaceRoot,
  hasSkillsDirectoryContent,
  repackFileMapAsZip,
  JSZip
} from '@fastgpt/service/core/ai/skill/package';

// ===========================================================================
// getSupportedArchiveFormat
// ===========================================================================
describe('getSupportedArchiveFormat', () => {
  it('returns zip for .zip', () => {
    expect(getSupportedArchiveFormat('skill.zip')).toBe('zip');
  });

  it('returns tar for .tar', () => {
    expect(getSupportedArchiveFormat('skill.tar')).toBe('tar');
  });

  it('returns tar.gz for .tar.gz', () => {
    expect(getSupportedArchiveFormat('skill.tar.gz')).toBe('tar.gz');
  });

  it('returns tar.gz for .tgz', () => {
    expect(getSupportedArchiveFormat('skill.tgz')).toBe('tar.gz');
  });

  it('returns null for unsupported extension', () => {
    expect(getSupportedArchiveFormat('skill.rar')).toBeNull();
    expect(getSupportedArchiveFormat('skill.7z')).toBeNull();
    expect(getSupportedArchiveFormat('skill')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(getSupportedArchiveFormat('Skill.ZIP')).toBe('zip');
    expect(getSupportedArchiveFormat('Skill.TAR.GZ')).toBe('tar.gz');
    expect(getSupportedArchiveFormat('Skill.TGZ')).toBe('tar.gz');
  });
});

// ===========================================================================
// isIgnoredSystemArchiveEntry
// ===========================================================================
describe('isIgnoredSystemArchiveEntry', () => {
  it('ignores common OS generated archive entries', () => {
    expect(isIgnoredSystemArchiveEntry('__MACOSX/._SKILL.md')).toBe(true);
    expect(isIgnoredSystemArchiveEntry('workspace/__MACOSX/skills/._main.ts')).toBe(true);
    expect(isIgnoredSystemArchiveEntry('skills/demo/.DS_Store')).toBe(true);
    expect(isIgnoredSystemArchiveEntry('skills/demo/._SKILL.md')).toBe(true);
    expect(isIgnoredSystemArchiveEntry('skills/demo/Thumbs.db')).toBe(true);
    expect(isIgnoredSystemArchiveEntry('skills/demo/desktop.ini')).toBe(true);
  });

  it('keeps normal skill files', () => {
    expect(isIgnoredSystemArchiveEntry('skills/demo/SKILL.md')).toBe(false);
    expect(isIgnoredSystemArchiveEntry('skills/demo/src/main.ts')).toBe(false);
    expect(isIgnoredSystemArchiveEntry('skills/demo/.env.example')).toBe(false);
  });
});

// ===========================================================================
// findSkillMdKey
// ===========================================================================
describe('findSkillMdKey', () => {
  it('finds SKILL.md at root', () => {
    const fileMap = { 'SKILL.md': Buffer.from(''), 'main.py': Buffer.from('') };
    expect(findSkillMdKey(fileMap)).toBe('SKILL.md');
  });

  it('finds skill.md at root case-insensitively', () => {
    const fileMap = { 'skill.md': Buffer.from(''), 'main.py': Buffer.from('') };
    expect(findSkillMdKey(fileMap)).toBe('skill.md');
  });

  it('finds SKILL.md one level deep', () => {
    const fileMap = { 'my-skill/SKILL.md': Buffer.from(''), 'my-skill/main.py': Buffer.from('') };
    expect(findSkillMdKey(fileMap)).toBe('my-skill/SKILL.md');
  });

  it('does not find SKILL.md more than one level deep', () => {
    const fileMap = { 'a/b/SKILL.md': Buffer.from('') };
    expect(findSkillMdKey(fileMap)).toBeNull();
  });

  it('returns null when no SKILL.md present', () => {
    const fileMap = { 'README.md': Buffer.from(''), 'main.py': Buffer.from('') };
    expect(findSkillMdKey(fileMap)).toBeNull();
  });

  it('returns null for empty file map', () => {
    expect(findSkillMdKey({})).toBeNull();
  });
});

// ===========================================================================
// getRootPrefix
// ===========================================================================
describe('getRootPrefix', () => {
  it('returns empty string for root-level SKILL.md', () => {
    expect(getRootPrefix('SKILL.md')).toBe('');
  });

  it('returns directory prefix for subdirectory SKILL.md', () => {
    expect(getRootPrefix('my-skill/SKILL.md')).toBe('my-skill/');
  });
});

// ===========================================================================
// stripRootPrefix
// ===========================================================================
describe('stripRootPrefix', () => {
  it('returns unchanged map when prefix is empty', () => {
    const fileMap = { 'SKILL.md': Buffer.from('a'), 'main.py': Buffer.from('b') };
    expect(stripRootPrefix(fileMap, '')).toEqual(fileMap);
  });

  it('strips the prefix from matching keys', () => {
    const fileMap = {
      'my-skill/SKILL.md': Buffer.from('a'),
      'my-skill/src/main.py': Buffer.from('b'),
      'other/file.txt': Buffer.from('c') // does not match prefix
    };
    const result = stripRootPrefix(fileMap, 'my-skill/');
    expect(result).toHaveProperty('SKILL.md');
    expect(result).toHaveProperty('src/main.py');
    expect(result).toHaveProperty('other/file.txt');
    expect(result).not.toHaveProperty('my-skill/SKILL.md');
  });

  it('removes keys that become empty after stripping', () => {
    // Key equals the prefix itself — stripping yields '' which should be dropped
    const fileMap = { 'my-skill/': Buffer.from('') };
    const result = stripRootPrefix(fileMap, 'my-skill/');
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ===========================================================================
// normalizeSkillWorkspaceRoot / hasSkillsDirectoryContent
// ===========================================================================
describe('normalizeSkillWorkspaceRoot', () => {
  it('keeps workspace-root skills directory unchanged', () => {
    const fileMap = {
      'skills/my-skill/SKILL.md': Buffer.from('a'),
      'skills/my-skill/src/main.ts': Buffer.from('b')
    };

    expect(normalizeSkillWorkspaceRoot(fileMap)).toEqual(fileMap);
  });

  it('strips archive wrapper before skills directory', () => {
    const fileMap = {
      'exported-workspace/skills/my-skill/SKILL.md': Buffer.from('a'),
      'exported-workspace/skills/my-skill/src/main.ts': Buffer.from('b')
    };
    const result = normalizeSkillWorkspaceRoot(fileMap);

    expect(result).toHaveProperty('skills/my-skill/SKILL.md');
    expect(result).toHaveProperty('skills/my-skill/src/main.ts');
    expect(result).not.toHaveProperty('exported-workspace/skills/my-skill/SKILL.md');
  });

  it('returns unchanged map when no skills directory exists', () => {
    const fileMap = { 'my-skill/SKILL.md': Buffer.from('a') };
    expect(normalizeSkillWorkspaceRoot(fileMap)).toEqual(fileMap);
  });
});

describe('hasSkillsDirectoryContent', () => {
  it('returns true when skills directory has files', () => {
    expect(
      hasSkillsDirectoryContent({
        'skills/my-skill/SKILL.md': Buffer.from('a')
      })
    ).toBe(true);
  });

  it('returns false for legacy root SKILL.md packages', () => {
    expect(
      hasSkillsDirectoryContent({
        'SKILL.md': Buffer.from('a'),
        'src/main.ts': Buffer.from('b')
      })
    ).toBe(false);
  });

  it('returns false when only non-skills files exist', () => {
    expect(
      hasSkillsDirectoryContent({
        'README.md': Buffer.from('a')
      })
    ).toBe(false);
  });
});

// ===========================================================================
// repackFileMapAsZip
// ===========================================================================
describe('repackFileMapAsZip', () => {
  it('creates a valid ZIP buffer from a file map', async () => {
    const fileMap = {
      'SKILL.md': Buffer.from('# skill'),
      'src/main.py': Buffer.from('print("hello")')
    };
    const zipBuffer = await repackFileMapAsZip(fileMap);
    expect(zipBuffer).toBeInstanceOf(Buffer);
    expect(zipBuffer.length).toBeGreaterThan(0);
  });

  it('preserves all file paths in the resulting ZIP', async () => {
    const fileMap = {
      'SKILL.md': Buffer.from('# skill'),
      'src/utils.py': Buffer.from(''),
      'data/config.json': Buffer.from('{}')
    };
    const zipBuffer = await repackFileMapAsZip(fileMap);
    const zip = await JSZip.loadAsync(zipBuffer);
    const files = Object.keys(zip.files).filter((k) => !zip.files[k].dir);

    expect(files).toContain('SKILL.md');
    expect(files).toContain('src/utils.py');
    expect(files).toContain('data/config.json');
  });

  it('preserves file content', async () => {
    const content = 'name: test\ndescription: hello';
    const fileMap = { 'SKILL.md': Buffer.from(content) };
    const zipBuffer = await repackFileMapAsZip(fileMap);
    const zip = await JSZip.loadAsync(zipBuffer);
    const extracted = await zip.file('SKILL.md')!.async('string');
    expect(extracted).toBe(content);
  });

  it('returns empty (but valid) ZIP for empty file map', async () => {
    const zipBuffer = await repackFileMapAsZip({});
    expect(zipBuffer).toBeInstanceOf(Buffer);
    const zip = await JSZip.loadAsync(zipBuffer);
    expect(Object.keys(zip.files)).toHaveLength(0);
  });
});
