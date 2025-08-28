import {
  CHECK_LIST,
  ELEMENT_TRANSFORMERS,
  TEXT_FORMAT_TRANSFORMERS,
  type Transformer
} from '@lexical/markdown';

export const RICH_PROMPT_TRANSFORMERS: Array<Transformer> = [
  CHECK_LIST,
  ...ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS
];
