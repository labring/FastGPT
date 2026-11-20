import JSZip from 'jszip';
import type { RuntimeSkillMetadataType } from '@fastgpt/global/core/ai/skill/type';
import { parseSkillMarkdown } from '../utils';
import {
  findSkillMdEntries,
  normalizeSkillScanEntryPath,
  selectSkillEntryPaths
} from './skillEntryScan';
import { validateZipSafety } from './zipBuilder';

export type ExtractRuntimeSkillsFromPackageOptions = {
  allowEmpty?: boolean;
};

/**
 * 从 Skill 包中解析运行态子 Skill 元数据。
 *
 * 入口优先级（避免把示例/资源模板误当成可执行入口）：
 * 1. 若包内存在**标准工作区入口** `skills/<name>/SKILL.md`（大小写不敏感），只解析这些
 *    入口，更深层的 `SKILL.md`（如 `skills/<name>/examples/template/SKILL.md`）一律忽略，
 *    视为示例或资源文件；
 * 2. 否则（根级 / 一级目录 / 更深层等非标准布局），回退到递归扫描，保持任意深度可发布。
 *
 * 扫描规则与发布校验、运行态 `find` 命令一致：递归查找（仅文件、不把反斜杠当分隔符）、
 * 大小写不敏感、跳过 `node_modules/.venv/venv`。`path` 保留包内真实相对路径。
 * 初始空白 workspace 可通过 `allowEmpty` 跳过空包校验。
 */
export async function extractRuntimeSkillsFromPackage(
  zipBuffer: Buffer,
  options: ExtractRuntimeSkillsFromPackageOptions = {}
): Promise<RuntimeSkillMetadataType[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const safety = validateZipSafety(zip);
  if (!safety.valid) {
    throw new Error(safety.error || 'Invalid skill package');
  }

  const fileByNormalizedPath = new Map<string, JSZip.JSZipObject>();
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;
    const normalizedPath = normalizeSkillScanEntryPath(path);
    if (!fileByNormalizedPath.has(normalizedPath)) {
      fileByNormalizedPath.set(normalizedPath, file);
    }
  }

  const allSkillMdPaths = findSkillMdEntries(
    Object.entries(zip.files).map(([path, file]) => ({ path, isDir: file.dir }))
  );
  // 标准工作区入口存在时只解析标准入口，深层示例/资源里的 SKILL.md 不参与发布元数据。
  const skillMdPaths = selectSkillEntryPaths(allSkillMdPaths);

  const skillMdEntries = skillMdPaths.map((path) => ({
    path,
    file: fileByNormalizedPath.get(path)!
  }));

  if (skillMdEntries.length === 0) {
    if (options.allowEmpty) return [];
    throw new Error('Skill package must contain at least one SKILL.md');
  }

  const nameSet = new Set<string>();
  const runtimeSkills: RuntimeSkillMetadataType[] = [];

  for (const entry of skillMdEntries) {
    const content = await entry.file.async('string');
    const { frontmatter, error } = parseSkillMarkdown(content);
    if (error) {
      throw new Error(`${entry.path}: ${error}`);
    }

    const name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : '';
    if (!name) {
      throw new Error(`${entry.path}: frontmatter name is required`);
    }

    if (nameSet.has(name)) {
      throw new Error(`Duplicate runtime skill name: ${name}`);
    }
    nameSet.add(name);

    runtimeSkills.push({
      name,
      description:
        typeof frontmatter.description === 'string' ? frontmatter.description.trim() : '',
      path: entry.path
    });
  }

  return runtimeSkills;
}
