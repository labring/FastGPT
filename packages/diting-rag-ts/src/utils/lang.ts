// src/utils/lang.ts
// Language detection utilities - aligned with Python diting_rag.agent.utils

/**
 * Detect language: any CJK character present → Chinese, else English.
 *
 * Previous heuristic (>30% CJK) failed on mixed queries like
 * "reset-password.txt 是什么文件" where CJK ratio is low despite
 * the user clearly writing in Chinese.
 */
export function detectLang(text: string): string {
  return /[\u4e00-\u9fff]/.test(text) ? 'Chinese' : 'English';
}
