import { ORDERED_LIST, UNORDERED_LIST, type Transformer } from '@lexical/markdown';

export const RICH_PROMPT_TRANSFORMERS: Array<Transformer> = [ORDERED_LIST, UNORDERED_LIST];
