/**
 * Agent Sandbox Skills Prompt
 *
 * Implements progressive disclosure: only inject skill metadata
 * (name/description/location) into the prompt. LLM uses
 * sandbox_read_file to load full SKILL.md on demand.
 */

import type { DeployedSkillInfo } from './types';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build skills context prompt for progressive disclosure.
 *
 * Accepts DeployedSkillInfo[] so that name/description come from SKILL.md
 * frontmatter (scanned at deploy time) rather than from the database.
 * LLM loads full SKILL.md via sandbox_read_file when needed.
 *
 * When deployedSkills is empty, only the sandbox environment section is emitted,
 * allowing the agent to use sandbox tools even without any installed skills.
 */
export function buildSkillsContextPrompt(
  deployedSkills: DeployedSkillInfo[],
  workDirectory: string
): string {
  const lines: string[] = [];

  // Skills section: only when skills are deployed
  if (deployedSkills.length > 0) {
    lines.push('<agent_skills>');
    lines.push(
      'The following skills are deployed in the sandbox environment. When a task matches a skill description, use sandbox_read_file to load the SKILL.md for detailed instructions, then execute via sandbox_* tools.'
    );
    lines.push('');
    lines.push('<available_skills>');
    for (const info of deployedSkills) {
      lines.push('  <skill>');
      lines.push(`    <name>${escapeXml(info.name)}</name>`);
      lines.push(`    <description>${escapeXml(info.description)}</description>`);
      if (info.skillMdPath) {
        lines.push(`    <location>${escapeXml(info.skillMdPath)}</location>`);
      }
      if (info.directory) {
        lines.push(`    <directory>${escapeXml(info.directory)}</directory>`);
      }
      lines.push('  </skill>');
    }
    lines.push('</available_skills>');
    lines.push('</agent_skills>');
    lines.push('');
  }

  // Sandbox environment section: always present
  lines.push('<sandbox_environment>');
  lines.push(`Workspace root: ${workDirectory}`);
  lines.push(
    'You have access to sandbox_* tools: read, write, edit, execute, search files, and fetch user-uploaded files.'
  );
  lines.push(
    'If the conversation includes <available_files>, use sandbox_fetch_user_file to copy files into the workspace.'
  );
  lines.push(
    'Always use RELATIVE paths for target_path (e.g. "uploads/file.pdf"), never absolute paths or "..".'
  );
  lines.push(`Files are placed at: ${workDirectory}/<target_path>`);
  lines.push('</sandbox_environment>');

  return lines.join('\n');
}
