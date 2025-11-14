import type { JSX } from 'react';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import * as React from 'react';
import { RICH_PROMPT_TRANSFORMERS } from '../MarkdownTransformers';

export default function MarkdownPlugin(): JSX.Element {
  return <MarkdownShortcutPlugin transformers={RICH_PROMPT_TRANSFORMERS} />;
}
