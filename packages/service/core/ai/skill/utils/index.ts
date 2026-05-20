/**
 * Skill 纯工具统一出口。
 *
 * 这里只放无副作用的 SKILL.md 文本解析和模板拼装，不访问数据库、对象存储、sandbox 或 LLM。
 */
export { parseSkillMarkdown, extractSkillFromMarkdown } from './skillMarkdown';
export * from './skillMdTemplate';
