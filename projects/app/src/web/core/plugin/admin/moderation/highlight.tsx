import React from 'react';
import { Box } from '@chakra-ui/react';
import { ModerationStageEnum } from '@fastgpt/global/core/plugin/moderation/constants';
import type { NodeModerationRecordType } from '@fastgpt/global/core/plugin/moderation/type';

/**
 * 从长文本中截取包含关键词的局部文字片段（前后保留适度上下文并添加省略号）
 */
export const extractContentSnippet = (text: string, keywords: string[], maxLen = 120): string => {
  if (!text || text.length <= maxLen) return text;

  // 寻找首个关键词在文本中的出现位置
  let firstIndex = -1;
  let matchedKeywordLen = 0;

  for (const kw of keywords) {
    if (!kw) continue;
    const idx = text.toLowerCase().indexOf(kw.toLowerCase());
    if (idx !== -1 && (firstIndex === -1 || idx < firstIndex)) {
      firstIndex = idx;
      matchedKeywordLen = kw.length;
    }
  }

  // 若未匹配到具体关键词位置，默认截取前 maxLen 个字符并加省略号
  if (firstIndex === -1) {
    return `${text.slice(0, maxLen)}...`;
  }

  // 以首个命中关键词为中心，向前截取约 40 字符，向后截取约 60 字符
  const contextBefore = 40;
  const contextAfter = Math.max(60, maxLen - contextBefore - matchedKeywordLen);

  const start = Math.max(0, firstIndex - contextBefore);
  const end = Math.min(text.length, firstIndex + matchedKeywordLen + contextAfter);

  const snippet = text.slice(start, end);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';

  return `${prefix}${snippet}${suffix}`;
};

/**
 * 在内容详情中将命中的敏感词使用黄色/橙色底色高亮显示（对齐 Figma 设计稿）
 */
export const renderHighlightedModerationContent = (
  text: string,
  keywords: string[]
): React.ReactNode => {
  if (!keywords || keywords.length === 0 || !text) {
    return text;
  }
  const escaped = keywords.filter(Boolean).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return text;

  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) => {
    const isHit = keywords.some((k) => k.toLowerCase() === part.toLowerCase());
    if (isHit) {
      return (
        <Box
          key={index}
          as="span"
          color="#dc6803"
          bg="#fffaeb"
          border={'1px solid'}
          borderColor={'#fedf89'}
          px={1}
          py={'1px'}
          mx={0.5}
          borderRadius="4px"
          fontWeight={500}
        >
          {part}
        </Box>
      );
    }
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
};

/**
 * 获取审核阶段多语言标签 key
 */
export const getModerationStageI18nKey = (stage: NodeModerationRecordType['stage']): string => {
  switch (stage) {
    case ModerationStageEnum.entry:
      return 'chat:response.moderation_stage_entry';
    case ModerationStageEnum.modelInput:
      return 'chat:response.moderation_stage_model_input';
    case ModerationStageEnum.output:
    default:
      return 'chat:response.moderation_stage_output';
  }
};

/**
 * 获取审核裁决结果多语言标签 key
 */
export const getModerationVerdictI18nKey = (
  verdict: NodeModerationRecordType['verdict']
): string => {
  switch (verdict) {
    case 'error':
      return 'chat:response.moderation_result_error';
    case 'suspected':
      return 'chat:response.moderation_result_suspected';
    case 'block':
    default:
      return 'chat:response.moderation_result_block';
  }
};
