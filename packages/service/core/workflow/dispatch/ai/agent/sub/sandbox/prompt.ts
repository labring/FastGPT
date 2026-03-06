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
 */
export function buildSkillsContextPrompt(deployedSkills: DeployedSkillInfo[]): string {
  if (deployedSkills.length === 0) return '';

  const lines = [
    '<agent_skills>',
    'The following skills are deployed in the sandbox environment. When a task matches a skill description, use sandbox_read_file to load the SKILL.md for detailed instructions, then execute via sandbox_* tools.',
    '',
    '<available_skills>'
  ];

  for (const info of deployedSkills) {
    lines.push('  <skill>');
    lines.push(`    <name>${escapeXml(info.name)}</name>`);
    lines.push(`    <description>${escapeXml(info.description)}</description>`);
    lines.push(`    <location>${escapeXml(info.skillMdPath)}</location>`);
    lines.push(`    <directory>${escapeXml(info.directory)}</directory>`);
    lines.push('  </skill>');
  }

  lines.push('</available_skills>');
  lines.push('</agent_skills>');

  return lines.join('\n');
}
