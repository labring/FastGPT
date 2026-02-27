/**
 * Agent Sandbox Skills Prompt
 *
 * Implements progressive disclosure: only inject skill metadata
 * (name/description/location) into the prompt. LLM uses
 * sandbox_read_file to load full SKILL.md on demand.
 */

import type { AgentSkillSchemaType } from '@fastgpt/global/core/agentSkill/type';

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
 * Only includes skill metadata (name, description, SKILL.md path).
 * LLM loads full SKILL.md via sandbox_read_file when needed.
 */
export function buildSkillsContextPrompt(
  skills: AgentSkillSchemaType[],
  workDirectory: string
): string {
  if (skills.length === 0) return '';

  const lines = [
    '<agent_skills>',
    'The following skills are deployed in the sandbox environment. When a task matches a skill description, use sandbox_read_file to load the SKILL.md for detailed instructions, then execute via sandbox_* tools.',
    '',
    '<available_skills>'
  ];

  for (const skill of skills) {
    const skillDir = `${workDirectory}/${skill.name}`;
    lines.push('  <skill>');
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push(`    <location>${escapeXml(skillDir + '/SKILL.md')}</location>`);
    lines.push(`    <directory>${escapeXml(skillDir)}</directory>`);
    lines.push('  </skill>');
  }

  lines.push('</available_skills>');
  lines.push('</agent_skills>');

  return lines.join('\n');
}
