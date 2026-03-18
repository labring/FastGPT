import { describe, expect, it } from 'vitest';

import type { ImportSkillBody } from '@fastgpt/global/core/agentSkills/api';
import type { SkillPackageType } from '@fastgpt/global/core/agentSkills/type';
import { AgentSkillCategoryEnum } from '@fastgpt/global/core/agentSkills/constants';
import {
  getSupportedArchiveFormat,
  findSkillMdKey,
  getRootPrefix,
  stripRootPrefix
} from '@fastgpt/service/core/agentSkills/archiveUtils';
import { repackFileMapAsZip, JSZip } from '@fastgpt/service/core/agentSkills/zipBuilder';

// ---------------------------------------------------------------------------
// Helpers that mirror the core logic in the import API route
// (import.ts cannot be imported directly due to Next.js / auth / DB deps)
// ---------------------------------------------------------------------------

/** Replicate the body-building logic from import.ts */
function buildImportBody(
  resultData: Partial<ImportSkillBody>,
  reqBody: Partial<ImportSkillBody> | undefined
): ImportSkillBody {
  return {
    name: resultData.name ?? reqBody?.name,
    description: resultData.description ?? reqBody?.description,
    avatar: resultData.avatar ?? reqBody?.avatar
  };
}

/** Replicate the pkgName / pkgDescription derivation from import.ts */
function derivePkgMeta(
  body: ImportSkillBody,
  originalname: string | undefined
): { pkgName: string; pkgDescription: string } {
  const pkgName =
    body.name ||
    (originalname ?? 'package').replace(/\.(zip|tar\.gz|tgz|tar)$/i, '').trim() ||
    'package';
  const pkgDescription = body.description ?? '';
  return { pkgName, pkgDescription };
}

/** Replicate the skillPackage construction from import.ts */
function buildSkillPackage(
  pkgName: string,
  pkgDescription: string,
  avatar: string | undefined
): SkillPackageType {
  return {
    skill: {
      name: pkgName,
      description: pkgDescription,
      category: [AgentSkillCategoryEnum.other],
      config: {},
      avatar
    }
  };
}

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
// buildImportBody – body merging logic
// ===========================================================================
describe('buildImportBody', () => {
  it('uses result.data values when present', () => {
    const body = buildImportBody(
      { name: 'from-data', description: 'desc-data', avatar: 'https://data.com/icon.png' },
      { name: 'from-req', description: 'desc-req', avatar: 'https://req.com/icon.png' }
    );
    expect(body.name).toBe('from-data');
    expect(body.description).toBe('desc-data');
    expect(body.avatar).toBe('https://data.com/icon.png');
  });

  it('falls back to req.body when result.data fields are undefined', () => {
    const body = buildImportBody(
      {},
      {
        name: 'fallback-name',
        description: 'fallback-desc',
        avatar: 'https://fallback.com/icon.png'
      }
    );
    expect(body.name).toBe('fallback-name');
    expect(body.description).toBe('fallback-desc');
    expect(body.avatar).toBe('https://fallback.com/icon.png');
  });

  it('returns all undefined when both sources are empty', () => {
    const body = buildImportBody({}, undefined);
    expect(body.name).toBeUndefined();
    expect(body.description).toBeUndefined();
    expect(body.avatar).toBeUndefined();
  });

  it('avatar is undefined when neither source provides it', () => {
    const body = buildImportBody({ name: 'only-name' }, { description: 'only-desc' });
    expect(body.avatar).toBeUndefined();
  });

  it('result.data avatar takes precedence over req.body avatar', () => {
    const body = buildImportBody(
      { avatar: 'https://primary.com/icon.png' },
      { avatar: 'https://secondary.com/icon.png' }
    );
    expect(body.avatar).toBe('https://primary.com/icon.png');
  });

  it('accepts base64 string as avatar', () => {
    const base64 = 'data:image/png;base64,iVBORw0KGgo=';
    const body = buildImportBody({ avatar: base64 }, undefined);
    expect(body.avatar).toBe(base64);
  });
});

// ===========================================================================
// derivePkgMeta – package name / description derivation
// ===========================================================================
describe('derivePkgMeta', () => {
  it('uses body.name when provided', () => {
    const { pkgName } = derivePkgMeta({ name: 'my-skill' }, 'archive.zip');
    expect(pkgName).toBe('my-skill');
  });

  it('strips extension from originalname when body.name is absent', () => {
    expect(derivePkgMeta({}, 'cool-skill.zip').pkgName).toBe('cool-skill');
    expect(derivePkgMeta({}, 'cool-skill.tar.gz').pkgName).toBe('cool-skill');
    expect(derivePkgMeta({}, 'cool-skill.tgz').pkgName).toBe('cool-skill');
    expect(derivePkgMeta({}, 'cool-skill.tar').pkgName).toBe('cool-skill');
  });

  it("defaults to 'package' when both body.name and originalname are absent", () => {
    expect(derivePkgMeta({}, undefined).pkgName).toBe('package');
  });

  it('body.name takes precedence over originalname', () => {
    const { pkgName } = derivePkgMeta({ name: 'explicit' }, 'archive.zip');
    expect(pkgName).toBe('explicit');
  });

  it('defaults pkgDescription to empty string when not provided', () => {
    const { pkgDescription } = derivePkgMeta({}, 'skill.zip');
    expect(pkgDescription).toBe('');
  });

  it('uses body.description when provided', () => {
    const { pkgDescription } = derivePkgMeta({ description: 'my description' }, 'skill.zip');
    expect(pkgDescription).toBe('my description');
  });
});

// ===========================================================================
// buildSkillPackage – skillPackage construction including avatar propagation
// ===========================================================================
describe('buildSkillPackage', () => {
  it('includes avatar when provided', () => {
    const pkg = buildSkillPackage('my-skill', 'desc', 'https://example.com/icon.png');
    expect(pkg.skill.avatar).toBe('https://example.com/icon.png');
  });

  it('avatar is undefined when not provided', () => {
    const pkg = buildSkillPackage('my-skill', 'desc', undefined);
    expect(pkg.skill.avatar).toBeUndefined();
  });

  it("defaults category to ['other']", () => {
    const pkg = buildSkillPackage('skill', '', undefined);
    expect(pkg.skill.category).toEqual(['other']);
  });

  it('sets name and description correctly', () => {
    const pkg = buildSkillPackage('test-skill', 'A test skill', undefined);
    expect(pkg.skill.name).toBe('test-skill');
    expect(pkg.skill.description).toBe('A test skill');
  });

  it('config defaults to empty object', () => {
    const pkg = buildSkillPackage('skill', '', undefined);
    expect(pkg.skill.config).toEqual({});
  });

  it('end-to-end: avatar flows from body through to skillPackage', () => {
    const resultData = { name: 'e2e-skill', avatar: 'https://cdn.example.com/icon.svg' };
    const body = buildImportBody(resultData, undefined);
    const { pkgName, pkgDescription } = derivePkgMeta(body, 'e2e-skill.zip');
    const pkg = buildSkillPackage(pkgName, pkgDescription, body.avatar);

    expect(pkg.skill.name).toBe('e2e-skill');
    expect(pkg.skill.avatar).toBe('https://cdn.example.com/icon.svg');
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
