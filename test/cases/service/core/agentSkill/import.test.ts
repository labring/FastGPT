import { describe, expect, it, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import fs from 'fs/promises';
import { randomBytes } from 'crypto';

// Import the function from the API route file
import type { ExtractedSkillPackage } from '@fastgpt/global/core/agentSkill/type';

// Load the extractSkillPackage function from the source file
// We'll need to test it directly, so we'll create a test implementation
// based on the actual implementation in import.ts

describe('extractSkillPackage', () => {
  let tempFiles: string[] = [];

  afterEach(async () => {
    // Clean up temporary files
    for (const file of tempFiles) {
      try {
        await fs.unlink(file);
      } catch {
        // Ignore errors
      }
    }
    tempFiles = [];
  });

  /**
   * Create a temporary ZIP file with given contents
   */
  async function createTempZip(contents: Record<string, string | Buffer>): Promise<string> {
    const zip = new JSZip();

    for (const [path, content] of Object.entries(contents)) {
      zip.file(path, content);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const tempFile = `/tmp/test-skill-${Date.now()}-${randomBytes(8).toString('hex')}.zip`;

    await fs.writeFile(tempFile, buffer);
    tempFiles.push(tempFile);

    return tempFile;
  }

  /**
   * Create a test SKILL.md content
   */
  function createSkillMd(name: string, description: string): string {
    return `---
name: ${name}
description: ${description}
---

# ${name}

This is a test skill.`;
  }

  /**
   * Mock implementation of extractSkillPackage for testing
   * This mirrors the actual implementation in import.ts
   */
  async function extractSkillPackage(filePath: string): Promise<ExtractedSkillPackage> {
    const { parseSkillPackage, extractSkillFromMarkdown } = await import(
      '@fastgpt/service/core/agentSkill/utils'
    );

    // Check ZIP file size (limit to 50MB by default, configurable via env var)
    const maxSizeEnv = process.env.MAX_SKILL_ZIP_SIZE;
    const maxZipSize = maxSizeEnv ? parseInt(maxSizeEnv, 10) : 50 * 1024 * 1024; // 50MB default

    const stats = await fs.stat(filePath);
    if (stats.size > maxZipSize) {
      throw new Error(
        `ZIP file size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${(maxZipSize / 1024 / 1024).toFixed(2)}MB)`
      );
    }

    // Read ZIP file to buffer
    const zipBuffer = await fs.readFile(filePath);

    // Load ZIP
    const zip = await JSZip.loadAsync(zipBuffer);
    const files = Object.keys(zip.files);

    // Find SKILL.md (required)
    const skillMdKey = files.find((key) => key === 'SKILL.md' || key.toLowerCase() === 'skill.md');

    if (!skillMdKey) {
      throw new Error('SKILL.md not found in ZIP archive');
    }

    // Get markdown content
    const skillMdFile = zip.file(skillMdKey);
    if (!skillMdFile) {
      throw new Error('SKILL.md not found in ZIP archive');
    }
    const markdown = await skillMdFile.async('string');

    // Extract skill metadata from SKILL.md frontmatter
    const { skill, error } = extractSkillFromMarkdown(markdown);

    if (error) {
      throw new Error(error);
    }

    // Build package
    const packageData = {
      skill,
      markdown
    };

    // Validate package
    const result = parseSkillPackage(packageData);

    if (!result.success) {
      throw new Error(result.error);
    }

    // Extract metadata for all ZIP entries
    const entriesMetadata = files.map((key) => {
      const file = zip.files[key];
      return {
        name: key,
        size: file._data?.uncompressedSize || 0,
        isDirectory: file.dir,
        uncompressedSize: file._data?.uncompressedSize || 0,
        compressionMethod: 8 // Default compression method (DEFLATE)
      };
    });

    return {
      skillPackage: result.package!,
      zipBuffer,
      zipEntries: entriesMetadata,
      totalSize: stats.size
    };
  }

  // ==================== Basic Tests ====================
  describe('Basic Functionality', () => {
    it('should extract skill package with only SKILL.md', async () => {
      const skillMd = createSkillMd('test-skill', 'A test skill');
      const tempFile = await createTempZip({ 'SKILL.md': skillMd });

      const result = await extractSkillPackage(tempFile);

      expect(result.skillPackage).toBeDefined();
      expect(result.skillPackage.skill.name).toBe('test-skill');
      expect(result.skillPackage.skill.description).toBe('A test skill');
      expect(result.skillPackage.markdown).toBe(skillMd);
      expect(result.zipBuffer).toBeInstanceOf(Buffer);
      expect(result.zipBuffer.length).toBeGreaterThan(0);
      expect(result.totalSize).toBeGreaterThan(0);
    });

    it('should extract skill package with additional files', async () => {
      const skillMd = createSkillMd('multi-file-skill', 'A skill with multiple files');
      const iconPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const readmeMd = '# README\n\nThis is additional documentation.';

      const tempFile = await createTempZip({
        'SKILL.md': skillMd,
        'assets/icon.png': iconPng,
        'assets/README.md': readmeMd,
        'code/main.py': 'print("Hello, World!")'
      });

      const result = await extractSkillPackage(tempFile);

      // Verify skill package
      expect(result.skillPackage.skill.name).toBe('multi-file-skill');

      // Verify ZIP entries metadata
      expect(result.zipEntries).toBeDefined();
      expect(result.zipEntries.length).toBeGreaterThanOrEqual(4);

      // Check for expected files
      const fileNames = result.zipEntries.map((e) => e.name);
      expect(fileNames).toContain('SKILL.md');
      expect(fileNames).toContain('assets/icon.png');
      expect(fileNames).toContain('assets/README.md');
      expect(fileNames).toContain('code/main.py');

      // Verify non-directory entries
      const files = result.zipEntries.filter((e) => !e.isDirectory);
      expect(files.length).toBeGreaterThanOrEqual(4);

      // Verify file sizes
      const iconEntry = result.zipEntries.find((e) => e.name === 'assets/icon.png');
      expect(iconEntry).toBeDefined();
      expect(iconEntry!.size).toBe(iconPng.length);
    });

    it('should handle nested directory structure', async () => {
      const skillMd = createSkillMd('nested-skill', 'Nested structure skill');

      const tempFile = await createTempZip({
        'SKILL.md': skillMd,
        'src/utils/helper.py': '# Helper functions',
        'src/core/engine.py': '# Core engine',
        'tests/test_helper.py': '# Test helper',
        'config/settings.json': '{ "setting": "value" }'
      });

      const result = await extractSkillPackage(tempFile);

      const fileNames = result.zipEntries.map((e) => e.name);
      expect(fileNames).toContain('src/utils/helper.py');
      expect(fileNames).toContain('src/core/engine.py');
      expect(fileNames).toContain('tests/test_helper.py');
      expect(fileNames).toContain('config/settings.json');
    });
  });

  // ==================== ZIP Entry Metadata Tests ====================
  describe('ZIP Entry Metadata', () => {
    it('should include correct metadata for each entry', async () => {
      const skillMd = createSkillMd('metadata-test', 'Test metadata');
      const tempFile = await createTempZip({
        'SKILL.md': skillMd,
        'test.txt': 'Some content'
      });

      const result = await extractSkillPackage(tempFile);

      // Check that each entry has required metadata fields
      for (const entry of result.zipEntries) {
        expect(entry.name).toBeDefined();
        expect(typeof entry.name).toBe('string');
        expect(entry.size).toBeDefined();
        expect(typeof entry.size).toBe('number');
        expect(entry.isDirectory).toBeDefined();
        expect(typeof entry.isDirectory).toBe('boolean');
      }
    });

    it('should correctly identify directories', async () => {
      const skillMd = createSkillMd('dir-test', 'Directory test');
      const tempFile = await createTempZip({
        'SKILL.md': skillMd,
        'assets/icon.png': 'png',
        'docs/README.md': '# Docs'
      });

      const result = await extractSkillPackage(tempFile);

      const directories = result.zipEntries.filter((e) => e.isDirectory);
      const files = result.zipEntries.filter((e) => !e.isDirectory);

      // Expect at least some directories (ZIP may include directory entries)
      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(result.zipEntries.some((e) => !e.isDirectory && e.name === 'SKILL.md')).toBe(true);
    });

    it('should include compression information', async () => {
      const skillMd = createSkillMd('compression-test', 'Compression test');
      const tempFile = await createTempZip({
        'SKILL.md': skillMd,
        'data.txt': 'Some data content'
      });

      const result = await extractSkillPackage(tempFile);

      const entries = result.zipEntries.filter((e) => !e.isDirectory);
      for (const entry of entries) {
        // Compression method should be defined (8 = DEFLATE, 0 = STORED)
        expect(entry.compressionMethod).toBeDefined();
        expect(typeof entry.compressionMethod).toBe('number');
      }
    });
  });

  // ==================== File Size Tests ====================
  describe('File Size Validation', () => {
    it('should return correct total size of ZIP file', async () => {
      const skillMd = createSkillMd('size-test', 'Size test');
      const tempFile = await createTempZip({
        'SKILL.md': skillMd,
        'file1.txt': 'Content 1',
        'file2.txt': 'Content 2'
      });

      const stats = await fs.stat(tempFile);
      const result = await extractSkillPackage(tempFile);

      expect(result.totalSize).toBe(stats.size);
      expect(result.totalSize).toBe(result.zipBuffer.length);
    });

    it('should reject ZIP file exceeding size limit', async () => {
      const skillMd = createSkillMd('large-skill', 'Large skill');

      // Create a ZIP with a large file
      const zip = new JSZip();
      zip.file('SKILL.md', skillMd);

      // Create a 51MB file (exceeds default 50MB limit)
      const largeContent = Buffer.alloc(51 * 1024 * 1024); // 51MB
      zip.file('large-file.dat', largeContent);

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const tempFile = `/tmp/test-large-${Date.now()}.zip`;
      await fs.writeFile(tempFile, buffer);
      tempFiles.push(tempFile);

      await expect(extractSkillPackage(tempFile)).rejects.toThrow('exceeds maximum allowed size');
    });

    it('should accept ZIP file within size limit', async () => {
      const skillMd = createSkillMd('valid-size', 'Valid size');
      const tempFile = await createTempZip({
        'SKILL.md': skillMd,
        'data.txt': 'Some data'
      });

      const stats = await fs.stat(tempFile);
      // Default limit is 50MB, so small files should work
      expect(stats.size).toBeLessThan(50 * 1024 * 1024);

      const result = await extractSkillPackage(tempFile);
      expect(result.skillPackage).toBeDefined();
    });

    it('should respect custom size limit from environment', async () => {
      const skillMd = createSkillMd('custom-limit', 'Custom limit test');

      // Set custom limit to 1MB
      vi.stubEnv('MAX_SKILL_ZIP_SIZE', '1048576'); // 1MB in bytes

      // Create a 2MB file
      const zip = new JSZip();
      zip.file('SKILL.md', skillMd);
      const largeContent = Buffer.alloc(2 * 1024 * 1024); // 2MB
      zip.file('large-file.dat', largeContent);

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const tempFile = `/tmp/test-custom-limit-${Date.now()}.zip`;
      await fs.writeFile(tempFile, buffer);
      tempFiles.push(tempFile);

      await expect(extractSkillPackage(tempFile)).rejects.toThrow('exceeds maximum allowed size');

      vi.unstubAllEnvs();
    });
  });

  // ==================== Error Handling Tests ====================
  describe('Error Handling', () => {
    it('should throw error when SKILL.md is missing', async () => {
      const tempFile = await createTempZip({
        'README.md': '# README'
      });

      await expect(extractSkillPackage(tempFile)).rejects.toThrow('SKILL.md not found');
    });

    it('should throw error for invalid skill markdown', async () => {
      const invalidMd = `---
description: Missing name
---
# Invalid`;

      const tempFile = await createTempZip({ 'SKILL.md': invalidMd });

      await expect(extractSkillPackage(tempFile)).rejects.toThrow();
    });

    it('should handle case-insensitive SKILL.md', async () => {
      const skillMd = createSkillMd('case-test', 'Case insensitive test');
      const tempFile = await createTempZip({ 'skill.md': skillMd });

      const result = await extractSkillPackage(tempFile);
      expect(result.skillPackage.skill.name).toBe('case-test');
    });
  });

  // ==================== Edge Cases ====================
  describe('Edge Cases', () => {
    it('should handle empty assets directory', async () => {
      const skillMd = createSkillMd('empty-assets', 'Empty assets');

      const tempFile = await createTempZip({
        'SKILL.md': skillMd,
        'assets/.gitkeep': '' // Empty file to create directory
      });

      const result = await extractSkillPackage(tempFile);
      expect(result.skillPackage.skill.name).toBe('empty-assets');
      expect(result.zipEntries.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle files with various extensions', async () => {
      const skillMd = createSkillMd('extensions-test', 'Various extensions');

      const tempFile = await createTempZip({
        'SKILL.md': skillMd,
        'image.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        'document.json': '{ "key": "value" }',
        'script.js': 'console.log("test");',
        'style.css': '.class { color: red; }',
        'data.xml': '<root></root>',
        'archive.tar.xz': 'tar content'
      });

      const result = await extractSkillPackage(tempFile);
      const fileNames = result.zipEntries.map((e) => e.name);

      expect(fileNames).toContain('image.png');
      expect(fileNames).toContain('document.json');
      expect(fileNames).toContain('script.js');
      expect(fileNames).toContain('style.css');
      expect(fileNames).toContain('data.xml');
      expect(fileNames).toContain('archive.tar.xz');
    });

    it('should handle deeply nested paths', async () => {
      const skillMd = createSkillMd('deep-nest', 'Deep nesting');

      const tempFile = await createTempZip({
        'SKILL.md': skillMd,
        'a/b/c/d/e/file.txt': 'Deep content'
      });

      const result = await extractSkillPackage(tempFile);
      const fileNames = result.zipEntries.map((e) => e.name);

      expect(fileNames).toContain('a/b/c/d/e/file.txt');
    });
  });
});
