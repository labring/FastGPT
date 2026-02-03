import { describe, expect, it } from 'vitest';
import {
  createSkillPackage,
  addFileToZip,
  generateZipBuffer,
  validateZipStructure,
  extractSkillPackage
} from '@fastgpt/service/core/agentSkill/zipBuilder';
import JSZip from 'jszip';

describe('zipBuilder', () => {
  // ==================== createSkillPackage ====================
  describe('createSkillPackage', () => {
    it('should create zip with SKILL.md only', async () => {
      const skillMd = `---
name: test-skill
description: A test skill
---

# Test Skill

This is the documentation.`;

      const zipBuffer = await createSkillPackage({ skillMd });

      // Verify it's a valid zip buffer
      expect(Buffer.isBuffer(zipBuffer)).toBe(true);
      expect(zipBuffer.length).toBeGreaterThan(0);

      // Verify zip contents
      const zip = await JSZip.loadAsync(zipBuffer);
      const files = Object.keys(zip.files);

      expect(files).toContain('SKILL.md');
      expect(files).toHaveLength(1);

      // Verify SKILL.md content
      const skillMdContent = await zip.file('SKILL.md')?.async('string');
      expect(skillMdContent).toBe(skillMd);
    });

    it('should create zip with SKILL.md and additional assets', async () => {
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

      const zipBuffer = await createSkillPackage({ skillMd, assets });

      // Verify zip contents
      const zip = await JSZip.loadAsync(zipBuffer);
      const files = Object.keys(zip.files);

      expect(files).toContain('SKILL.md');
      expect(files).toContain('assets/icon.png');
      expect(files).toContain('assets/README.md');
      // JSZip may include directory entries, so we check at least 3 files
      expect(files.length).toBeGreaterThanOrEqual(3);

      // Verify file contents
      const skillMdContent = await zip.file('SKILL.md')?.async('string');
      expect(skillMdContent).toBe(skillMd);

      const iconContent = await zip.file('assets/icon.png')?.async('uint8array');
      expect(Buffer.from(iconContent!)).toEqual(iconPng);

      const readmeContent = await zip.file('assets/README.md')?.async('string');
      expect(readmeContent).toBe(readmeMd);
    });

    it('should handle empty assets object', async () => {
      const skillMd = `---
name: test-skill
description: A test skill
---

# Test`;

      const zipBuffer = await createSkillPackage({ skillMd, assets: {} });

      const zip = await JSZip.loadAsync(zipBuffer);
      const files = Object.keys(zip.files);

      expect(files).toContain('SKILL.md');
      expect(files).toHaveLength(1);
    });

    it('should handle large markdown content', async () => {
      const largeMarkdown = '# Large Document\n\n' + 'Content line.\n'.repeat(1000);

      const skillMd = `---
name: large-skill
description: A large skill
---

${largeMarkdown}`;

      const zipBuffer = await createSkillPackage({ skillMd });

      const zip = await JSZip.loadAsync(zipBuffer);
      const skillMdContent = await zip.file('SKILL.md')?.async('string');

      expect(skillMdContent).toBe(skillMd);
      expect(skillMdContent!.length).toBeGreaterThan(10000);
    });
  });

  // ==================== addFileToZip ====================
  describe('addFileToZip', () => {
    it('should add string content to zip', async () => {
      const zip = new JSZip();
      const content = 'File content here';

      addFileToZip(zip, 'test.txt', content);

      const files = Object.keys(zip.files);
      expect(files).toContain('test.txt');

      const fileContent = await zip.file('test.txt')?.async('string');
      expect(fileContent).toBe(content);
    });

    it('should add buffer content to zip', async () => {
      const zip = new JSZip();
      const content = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

      addFileToZip(zip, 'image.png', content);

      const fileContent = await zip.file('image.png')?.async('uint8array');
      expect(Buffer.from(fileContent!)).toEqual(content);
    });

    it('should handle nested paths', async () => {
      const zip = new JSZip();

      addFileToZip(zip, 'assets/images/icon.png', Buffer.from('png'));
      addFileToZip(zip, 'docs/README.md', '# Docs');

      const files = Object.keys(zip.files);
      expect(files).toContain('assets/images/icon.png');
      expect(files).toContain('docs/README.md');
    });
  });

  // ==================== generateZipBuffer ====================
  describe('generateZipBuffer', () => {
    it('should generate valid zip buffer', async () => {
      const zip = new JSZip();
      zip.file('test.txt', 'content');

      const buffer = await generateZipBuffer(zip);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);

      // Verify it's a valid zip
      const loadedZip = await JSZip.loadAsync(buffer);
      expect(Object.keys(loadedZip.files)).toContain('test.txt');
    });

    it('should generate empty zip for empty JSZip', async () => {
      const zip = new JSZip();

      const buffer = await generateZipBuffer(zip);

      expect(Buffer.isBuffer(buffer)).toBe(true);

      // Empty zip should still be loadable
      const loadedZip = await JSZip.loadAsync(buffer);
      expect(Object.keys(loadedZip.files)).toHaveLength(0);
    });
  });

  // ==================== validateZipStructure ====================
  describe('validateZipStructure', () => {
    it('should validate zip with SKILL.md', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', '---\nname: test\n---\n\n# Test');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateZipStructure(buffer);

      expect(result.valid).toBe(true);
      expect(result.hasSkillMd).toBe(true);
      expect(result.error).toBeUndefined();
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

    it('should invalidate empty zip', async () => {
      const zip = new JSZip();
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await validateZipStructure(buffer);

      expect(result.valid).toBe(false);
      // Empty zip will fail the SKILL.md check
      expect(result.error).toContain('SKILL.md');
    });

    it('should handle invalid zip data', async () => {
      const buffer = Buffer.from('not a valid zip file');
      const result = await validateZipStructure(buffer);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ==================== extractSkillPackage ====================
  describe('extractSkillPackage', () => {
    it('should extract SKILL.md from zip', async () => {
      const zip = new JSZip();
      const skillMd = '---\nname: test\n---\n\n# Test Skill';
      zip.file('SKILL.md', skillMd);

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await extractSkillPackage(buffer);

      expect(result.success).toBe(true);
      expect(result.skillMd).toBe(skillMd);
      expect(result.assets).toEqual({});
    });

    it('should extract SKILL.md and assets', async () => {
      const zip = new JSZip();
      zip.file('SKILL.md', '---\nname: test\n---\n');
      zip.file('assets/icon.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      zip.file('assets/README.md', '# README');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await extractSkillPackage(buffer);

      expect(result.success).toBe(true);
      expect(result.assets).toBeDefined();
      expect(Object.keys(result.assets!)).toContain('assets/icon.png');
      expect(Object.keys(result.assets!)).toContain('assets/README.md');
    });

    it('should return error for missing SKILL.md', async () => {
      const zip = new JSZip();
      zip.file('README.md', '# README');

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const result = await extractSkillPackage(buffer);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SKILL.md');
    });

    it('should handle invalid zip data', async () => {
      const buffer = Buffer.from('not a valid zip file');
      const result = await extractSkillPackage(buffer);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
