import {
  WorkflowDocumentSchema,
  normalizeWorkflowDocument,
  type WorkflowDocument
} from '@fastgpt/workflow-core';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { CliArgumentError } from '../error';

export const WORKFLOW_FILE_NAME = 'workflow.json';

export const parseWorkflowDocument = (input: unknown): WorkflowDocument =>
  WorkflowDocumentSchema.parse(input);

export const serializeWorkflowDocument = (document: WorkflowDocument) =>
  `${JSON.stringify(normalizeWorkflowDocument(WorkflowDocumentSchema.parse(document)), null, 2)}\n`;

export const getWorkflowFilePath = (dir: string) => join(resolve(dir), WORKFLOW_FILE_NAME);

export const readWorkflowFile = async (dir: string): Promise<WorkflowDocument> => {
  const content = await readFile(getWorkflowFilePath(dir), 'utf8');
  try {
    return parseWorkflowDocument(JSON.parse(content));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CliArgumentError('workflow.json must contain valid JSON');
    }
    throw error;
  }
};

/** 同目录临时文件 + fsync + rename，失败时不会留下半写入目标文件。 */
export const writeFileAtomic = async (filePath: string, content: string) => {
  const absolutePath = resolve(filePath);
  const directory = dirname(absolutePath);
  const temporaryPath = join(
    directory,
    `.${basename(absolutePath)}.${process.pid}.${Date.now()}.tmp`
  );
  await mkdir(directory, { recursive: true });

  const handle = await open(temporaryPath, 'wx');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
};

export const writeWorkflowFileAtomic = async (dir: string, document: WorkflowDocument) =>
  writeFileAtomic(getWorkflowFilePath(dir), serializeWorkflowDocument(document));

export const writeJsonFileAtomic = async (filePath: string, value: unknown) =>
  writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
