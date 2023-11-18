import { IMG_BLOCK_KEY, FILE_BLOCK_KEY } from './constants';

export function chatContentReplaceBlock(content: string = '') {
  const regex = new RegExp(`\`\`\`(${IMG_BLOCK_KEY})\\n([\\s\\S]*?)\`\`\``, 'g');
  return content.replace(regex, '').trim();
}
