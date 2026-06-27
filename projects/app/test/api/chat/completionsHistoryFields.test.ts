import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('chat completions history fields', () => {
  it.each(['src/pages/api/v1/chat/completions.ts', 'src/pages/api/v2/chat/completions.ts'])(
    '%s keeps agent loop memories when loading histories',
    (path) => {
      const source = readSource(path);

      expect(source).toContain('field: `obj value memories nodeOutputs`');
    }
  );
});
