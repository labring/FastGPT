import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
  createBlankSkillWorkspacePackage,
  createSkillPackage,
  validateDeployableSkillWorkspacePackage,
  validateZipStructure,
  extractSkillPackage,
  standardizeSkillPackageBySkillMdName,
  extractRuntimeSkillsFromPackage
} from '@fastgpt/service/core/ai/skill/package';

describe('zipBuilder', () => {
  // ==================== createSkillPackage ====================
  describe('createSkillPackage', () => {
    it('should create zip with root folder and SKILL.md', async () => {
      const name = 'test-skill';
      const skillMd = `---
name: test-skill
description: A test skill
---

# Test Skill

This is the documentation.`;

      const zipBuffer = await createSkillPackage({ name, skillMd });

      // Verify it's a valid zip buffer
      expect(Buffer.isBuffer(zipBuffer)).toBe(true);
      expect(zipBuffer.length).toBeGreaterThan(0);

      // Verify zip contents
      const zip = await JSZip.loadAsync(zipBuffer);
      const files = Object.keys(zip.files);

      expect(files).toContain(`${name}/SKILL.md`);
      expect(await zip.file('.gitignore')?.async('string')).toContain('node_modules/');
      // JSZip may or may not include directory entries depending on how it's called
      // but SKILL.md should definitely be there with the prefix

      // Verify SKILL.md content
      const skillMdContent = await zip.file(`${name}/SKILL.md`)?.async('string');
      expect(skillMdContent).toBe(skillMd);
    });

    it('should create zip with SKILL.md and additional assets in root folder', async () => {
      const name = 'test-skill';
      const skillMd = `---
name: test-skill
description: A test skill
---

# Test Skill`;

      const iconPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const readmeMd = '# Additional README\n\nMore documentation.';

      const assets = {
        'assets/icon.png': iconPng,
        'assets/README.md': Buffer.from(readmeMd, 'utf-8')
      };

      const zipBuffer = await createSkillPackage({ name, skillMd, assets });

      // Verify zip contents
      const zip = await JSZip.loadAsync(zipBuffer);
      const files = Object.keys(zip.files);

      expect(files).toContain(`${name}/SKILL.md`);
      expect(files).toContain(`${name}/assets/icon.png`);
      expect(files).toContain(`${name}/assets/README.md`);

      // Verify file contents
      const skillMdContent = await zip.file(`${name}/SKILL.md`)?.async('string');
      expect(skillMdContent).toBe(skillMd);

      const iconContent = await zip.file(`${name}/assets/icon.png`)?.async('uint8array');
      expect(Buffer.from(iconContent!)).toEqual(iconPng);

      const readmeContent = await zip.file(`${name}/assets/README.md`)?.async('string');
      expect(readmeContent).toBe(readmeMd);
    });

    it('should handle name with trailing slashes', async () => {
      const name = 'test-skill///';
      const skillMd = '# Test';

      const zipBuffer = await createSkillPackage({ name, skillMd });

      const zip = await JSZip.loadAsync(zipBuffer);
      const files = Object.keys(zip.files);

      expect(files).toContain('test-skill/SKILL.md');
    });

    it('should handle large markdown content', async () => {
      const name = 'large-skill';
      const largeMarkdown = '# Large Document\n\n' + 'Content line.\n'.repeat(1000);

      const skillMd = `---
name: large-skill
description: A large skill
---

${largeMarkdown}`;

      const zipBuffer = await createSkillPackage({ name, skillMd });

      const zip = await JSZip.loadAsync(zipBuffer);
      const skillMdContent = await zip.file('large-skill/SKILL.md')?.async('string');

      expect(skillMdContent).toBe(skillMd);
      expect(skillMdContent!.length).toBeGreaterThan(10000);
    });
  });

  // ==================== createBlankSkillWorkspacePackage ====================
  describe('createBlankSkillWorkspacePackage', () => {
    it('should create an initial blank workspace with .gitignore and empty skills directory', async () => {
      const zipBuffer = await createBlankSkillWorkspacePackage();

      expect(Buffer.isBuffer(zipBuffer)).toBe(true);
      expect(zipBuffer.length).toBeGreaterThan(0);

      const zip = await JSZip.loadAsync(zipBuffer);
      const files = Object.keys(zip.files);

      expect(files).toContain('.gitignore');
      expect(files).toContain('skills/');
      expect(files).not.toContain('skills/SKILL.md');
      expect(files.some((file) => /^skills\/[^/]+\/SKILL\.md$/i.test(file))).toBe(false);
    });
  });

  // ==================== extractRuntimeSkillsFromPackage ====================
  describe('extractRuntimeSkillsFromPackage', () => {
    it('should extract runtime skills from workspace package', async () => {
      const zip = new JSZip();
      zip.file(
        'skills/data-cleaning/SKILL.md',
        '---\nname: data-cleaning\ndescription: Clean table data\n---\n'
      );
      zip.file(
        'skills/chart-reporting/SKILL.md',
        '---\nname: chart-reporting\ndescription: Build chart reports\n---\n'
      );

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await extractRuntimeSkillsFromPackage(buffer);

      expect(result).toEqual([
        {
          name: 'chart-reporting',
          description: 'Build chart reports',
          path: 'skills/chart-reporting/SKILL.md'
        },
        {
          name: 'data-cleaning',
          description: 'Clean table data',
          path: 'skills/data-cleaning/SKILL.md'
        }
      ]);
    });

    it('should normalize legacy single skill package path', async () => {
      const zip = new JSZip();
      zip.file('legacy-skill/SKILL.MD', '---\nname: legacy-skill\n---\n');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await extractRuntimeSkillsFromPackage(buffer);

      expect(result).toEqual([
        {
          name: 'legacy-skill',
          description: '',
          path: 'skills/legacy-skill/SKILL.md'
        }
      ]);
    });

    it('should reject duplicate runtime skill names', async () => {
      const zip = new JSZip();
      zip.file('skills/a/SKILL.md', '---\nname: same\n---\n');
      zip.file('skills/b/SKILL.md', '---\nname: same\n---\n');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      await expect(extractRuntimeSkillsFromPackage(buffer)).rejects.toThrow(
        'Duplicate runtime skill name: same'
      );
    });

    it('should reject SKILL.md without frontmatter name', async () => {
      const zip = new JSZip();
      zip.file('skills/a/SKILL.md', '---\ndescription: Missing name\n---\n');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      await expect(extractRuntimeSkillsFromPackage(buffer)).rejects.toThrow(
        'frontmatter name is required'
      );
    });

    it('should reuse ZIP safety validation for unsafe entry paths', async () => {
      const zip = new JSZip();
      zip.file('skills/../SKILL.md', '---\nname: unsafe\n---\n');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      await expect(extractRuntimeSkillsFromPackage(buffer)).rejects.toThrow(
        'Unsafe ZIP entry path'
      );
    });

    it('should allow empty initial workspace when requested', async () => {
      const buffer = await createBlankSkillWorkspacePackage();

      await expect(extractRuntimeSkillsFromPackage(buffer, { allowEmpty: true })).resolves.toEqual(
        []
      );
    });
  });

  // ==================== validateZipStructure ====================
  describe('validateZipStructure', () => {
    it('should validate zip with SKILL.md at root', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', '---\nname: test\n---\n\n# Test');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateZipStructure(buffer);

      expect(result.valid).toBe(true);
      expect(result.hasSkillMd).toBe(true);
      expect(result.skillMdPath).toBe('SKILL.md');
    });

    it('should validate zip with SKILL.md in a subfolder', async () => {
      const zip = new JSZip();
      zip.file('my-skill/SKILL.md', '---\nname: test\n---\n\n# Test');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateZipStructure(buffer);

      expect(result.valid).toBe(true);
      expect(result.hasSkillMd).toBe(true);
      expect(result.skillMdPath).toBe('my-skill/SKILL.md');
    });

    it('should validate zip with SKILL.md in nested subfolders (workspace root style)', async () => {
      const zip = new JSZip();
      zip.file('skills/my-skill/SKILL.md', '---\nname: test\n---\n\n# Test');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateZipStructure(buffer);

      expect(result.valid).toBe(true);
      expect(result.hasSkillMd).toBe(true);
      expect(result.skillMdPath).toBe('skills/my-skill/SKILL.md');
    });

    it('should invalidate zip without SKILL.md', async () => {
      const zip = new JSZip();
      zip.file('README.md', '# README');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateZipStructure(buffer);

      expect(result.valid).toBe(false);
      expect(result.hasSkillMd).toBe(false);
      expect(result.error).toContain('SKILL.md');
    });

    it('should reject unsafe zip entry paths', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', '---\nname: test\n---');
      zip.file('../escape.txt', 'escape');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateZipStructure(buffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsafe ZIP entry path');
    });
  });

  // ==================== validateDeployableSkillWorkspacePackage ====================
  describe('validateDeployableSkillWorkspacePackage', () => {
    it('should reject blank initial workspace during publish validation', async () => {
      const buffer = await createBlankSkillWorkspacePackage();
      const result = await validateDeployableSkillWorkspacePackage(buffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least one first-level skill folder');
    });

    it('should accept a workspace with at least one first-level skill folder containing SKILL.md', async () => {
      const zip = new JSZip();
      zip.file('.gitignore', 'node_modules/\n');
      zip.file(
        'skills/seo-title-generator/SKILL.md',
        '---\nname: seo-title-generator\ndescription: SEO title generator\n---\n'
      );
      zip.file('skills/seo-title-generator/examples/input.md', '# Example');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateDeployableSkillWorkspacePackage(buffer);

      expect(result.valid).toBe(true);
    });

    it('should accept workspace entries prefixed by ./ from sandbox zip command', async () => {
      const zip = new JSZip();
      zip.file(
        './skills/seo-title-generator/SKILL.md',
        '---\nname: seo-title-generator\ndescription: SEO title generator\n---\n'
      );

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateDeployableSkillWorkspacePackage(buffer);

      expect(result.valid).toBe(true);
    });

    it('should reject when any first-level skill folder misses SKILL.md', async () => {
      const zip = new JSZip();
      zip.folder('skills/valid-skill');
      zip.file('skills/valid-skill/SKILL.md', '---\nname: valid-skill\n---\n');
      zip.folder('skills/missing-entry');
      zip.file('skills/missing-entry/README.md', '# Missing entry');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateDeployableSkillWorkspacePackage(buffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing-entry');
    });

    it('should accept case-insensitive SKILL.md for deployable skill folders', async () => {
      const zip = new JSZip();
      zip.file('skills/lowercase-entry/skill.md', '---\nname: lowercase-entry\n---\n');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateDeployableSkillWorkspacePackage(buffer);

      expect(result.valid).toBe(true);
    });

    it('should extract runtime skills from case-insensitive SKILL.md entries', async () => {
      const zip = new JSZip();
      zip.file('skills/lowercase-entry/skill.md', '---\nname: lowercase-entry\n---\n');
      zip.file('UPPERCASE/SKILL.MD', '---\nname: uppercase-entry\n---\n');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await extractRuntimeSkillsFromPackage(buffer);

      expect(result).toEqual([
        {
          name: 'lowercase-entry',
          description: '',
          path: 'skills/lowercase-entry/skill.md'
        }
      ]);
    });

    it('should reject unsafe zip entry paths before workspace structure validation', async () => {
      const zip = new JSZip();
      zip.file('skills/valid-skill/SKILL.md', '---\nname: valid-skill\n---\n');
      zip.file('../escape.txt', 'escape');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateDeployableSkillWorkspacePackage(buffer);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsafe ZIP entry path');
    });
  });

  // ==================== extractSkillPackage ====================
  describe('extractSkillPackage', () => {
    it('should extract SKILL.md from zip root', async () => {
      const zip = new JSZip();
      const skillMd = '---\nname: test\n---\n\n# Test Skill';
      zip.file('SKILL.md', skillMd);

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await extractSkillPackage(buffer);

      expect(result.success).toBe(true);
      expect(result.skillMd).toBe(skillMd);
      expect(result.assets).toEqual({});
    });

    it('should extract SKILL.md from subfolder and strip prefix from assets', async () => {
      const zip = new JSZip();
      const skillMd = '---\nname: test\n---\n';
      zip.file('my-skill/SKILL.md', skillMd);
      zip.file('my-skill/assets/icon.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      zip.file('my-skill/README.md', '# README');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await extractSkillPackage(buffer);

      expect(result.success).toBe(true);
      expect(result.skillMd).toBe(skillMd);
      expect(result.assets).toBeDefined();
      expect(Object.keys(result.assets!)).toContain('assets/icon.png');
      expect(Object.keys(result.assets!)).toContain('README.md');
      expect(Object.keys(result.assets!)).not.toContain('my-skill/README.md');
    });

    it('should extract SKILL.md from nested subfolders and strip prefix from assets, preserving root level assets', async () => {
      const zip = new JSZip();
      const skillMd = '---\nname: test\n---\n';
      zip.file('skills/my-skill/SKILL.md', skillMd);
      zip.file('skills/my-skill/assets/icon.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      zip.file('package.json', '{}');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await extractSkillPackage(buffer);

      expect(result.success).toBe(true);
      expect(result.skillMd).toBe(skillMd);
      expect(result.assets).toBeDefined();
      expect(Object.keys(result.assets!)).toContain('assets/icon.png');
      expect(Object.keys(result.assets!)).toContain('package.json');
      expect(Object.keys(result.assets!)).not.toContain('skills/my-skill/assets/icon.png');
    });

    it('should return error for missing SKILL.md', async () => {
      const zip = new JSZip();
      zip.file('README.md', '# README');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await extractSkillPackage(buffer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SKILL.md');
    });
  });

  describe('standardizeSkillPackageBySkillMdName', () => {
    it('uses SKILL.md frontmatter name as package root instead of the existing directory name', async () => {
      const zip = new JSZip();
      const skillMd = `---
name: real-runtime-skill
description: Real runtime skill
---

# Real runtime skill`;

      zip.file('database-display-name/SKILL.md', skillMd);
      zip.file('database-display-name/src/main.ts', 'export default 1;');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await standardizeSkillPackageBySkillMdName(buffer);
      const standardizedZip = await JSZip.loadAsync(result.buffer);
      const files = Object.keys(standardizedZip.files).filter(
        (path) => !standardizedZip.files[path].dir
      );

      expect(result.name).toBe('real-runtime-skill');
      expect(files).toEqual(
        expect.arrayContaining([
          'skills/real-runtime-skill/SKILL.md',
          'skills/real-runtime-skill/src/main.ts'
        ])
      );
      expect(files).not.toContain('database-display-name/SKILL.md');
    });

    it('preserves other files outside rootPrefix like .bashrc and other directories', async () => {
      const zip = new JSZip();
      const skillMd = `---
name: real-runtime-skill
description: Real runtime skill
---

# Real runtime skill`;

      zip.file('skills/real-runtime-skill/SKILL.md', skillMd);
      zip.file('skills/real-runtime-skill/src/main.ts', 'export default 1;');
      zip.file('.local/share/code-server/User/settings.json', '{}');
      zip.file('abc/SKILL.md', '---\nname: abc\n---\n');
      zip.file('.bashrc', '# bashrc');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await standardizeSkillPackageBySkillMdName(buffer);
      const standardizedZip = await JSZip.loadAsync(result.buffer);
      const files = Object.keys(standardizedZip.files).filter(
        (path) => !standardizedZip.files[path].dir
      );
      expect(files).toEqual(
        expect.arrayContaining([
          'skills/real-runtime-skill/SKILL.md',
          'skills/real-runtime-skill/src/main.ts',
          'skills/real-runtime-skill/.local/share/code-server/User/settings.json',
          'skills/real-runtime-skill/abc/SKILL.md',
          'skills/real-runtime-skill/.bashrc'
        ])
      );
    });
  });
});
