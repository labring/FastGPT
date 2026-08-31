import {
  parseWorkflowDocument,
  readWorkflowFile,
  serializeWorkflowDocument,
  writeFileAtomic,
  writeWorkflowFileAtomic
} from '../../src';
import aiWorkflow from '../../../workflow-core/test/fixtures/basic-ai/workflow.json';
import { mkdtemp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('workflow file codec', () => {
  it('round-trips with stable formatting and a trailing newline', async () => {
    const document = parseWorkflowDocument(aiWorkflow);
    const serialized = serializeWorkflowDocument(document);
    expect(serialized.endsWith('\n')).toBe(true);
    expect(parseWorkflowDocument(JSON.parse(serialized))).toEqual(document);

    const dir = await mkdtemp(join(tmpdir(), 'workflow-file-'));
    await writeWorkflowFileAtomic(dir, document);
    await expect(readWorkflowFile(dir)).resolves.toEqual(document);
    expect(await readFile(join(dir, 'workflow.json'), 'utf8')).toBe(serialized);
  });

  it('keeps an existing directory and cleans temporary files when rename fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'workflow-atomic-'));
    const targetDirectory = join(dir, 'target');
    await mkdir(targetDirectory);
    await expect(writeFileAtomic(targetDirectory, 'value')).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['target']);
  });

  it('reports malformed workflow JSON as a CLI argument error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'workflow-invalid-'));
    await writeFile(join(dir, 'workflow.json'), '{', 'utf8');
    await expect(readWorkflowFile(dir)).rejects.toMatchObject({ code: 'CLI_ARGUMENT_INVALID' });
  });

  it('reports unsupported schema versions with migration guidance', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'workflow-version-'));
    await writeFile(
      join(dir, 'workflow.json'),
      JSON.stringify({ ...aiWorkflow, schemaVersion: 'fastgpt-workflow/v2' }),
      'utf8'
    );
    await expect(readWorkflowFile(dir)).rejects.toMatchObject({
      code: 'CLI_ARGUMENT_INVALID',
      params: {
        code: 'WORKFLOW_DOCUMENT_VERSION_UNSUPPORTED',
        foundVersion: 'fastgpt-workflow/v2',
        guidance: expect.stringContaining('migrate one version at a time')
      }
    });
  });
});
