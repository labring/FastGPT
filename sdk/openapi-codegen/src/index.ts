import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { buildSdkIrDocument } from './buildIr';
import { emitGoModelsFile, emitGoResourcesFile } from './goEmitter';
import { emitTypeScriptResourcesFile, emitTypeScriptTypesFile } from './tsEmitter';

export type GeneratedArtifacts = {
  irPath: string;
  irContent: string;
  typesPath: string;
  typesContent: string;
  resourcesPath: string;
  resourcesContent: string;
  goModelsPath: string;
  goModelsContent: string;
  goResourcesPath: string;
  goResourcesContent: string;
};

const resolveRepoPaths = () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const codegenRoot = path.resolve(currentDir, '..');
  const sdkRoot = path.resolve(codegenRoot, '..');
  const repoRoot = path.resolve(sdkRoot, '..');

  return {
    repoRoot,
    irPath: path.join(codegenRoot, 'spec/sdk-ir.json'),
    typesPath: path.join(sdkRoot, 'client/src/generated/types.ts'),
    resourcesPath: path.join(sdkRoot, 'client/src/generated/resources.ts'),
    goModelsPath: path.join(sdkRoot, 'go/models_gen.go'),
    goResourcesPath: path.join(sdkRoot, 'go/resources_gen.go')
  };
};

/**
 * 在内存中执行完整的 IR 编译与 TypeScript / Go 代码生成，并使用主仓 Prettier 配置统一格式化 TS 与 IR。
 */
export const compileSdkArtifacts = async (): Promise<GeneratedArtifacts> => {
  const paths = resolveRepoPaths();
  const ir = buildSdkIrDocument();

  const prettierConfig =
    (await prettier.resolveConfig(paths.typesPath)) ??
    (await prettier.resolveConfig(path.join(paths.repoRoot, 'package.json'))) ??
    {};

  const rawIrJson = `${JSON.stringify(ir, null, 2)}\n`;
  const rawTypesTs = emitTypeScriptTypesFile(ir);
  const rawResourcesTs = emitTypeScriptResourcesFile(ir);
  const goModelsContent = emitGoModelsFile(ir);
  const goResourcesContent = emitGoResourcesFile(ir);

  const [irContent, typesContent, resourcesContent] = await Promise.all([
    prettier.format(rawIrJson, { ...prettierConfig, filepath: paths.irPath }),
    prettier.format(rawTypesTs, { ...prettierConfig, filepath: paths.typesPath }),
    prettier.format(rawResourcesTs, { ...prettierConfig, filepath: paths.resourcesPath })
  ]);

  return {
    irPath: paths.irPath,
    irContent,
    typesPath: paths.typesPath,
    typesContent,
    resourcesPath: paths.resourcesPath,
    resourcesContent,
    goModelsPath: paths.goModelsPath,
    goModelsContent,
    goResourcesPath: paths.goResourcesPath,
    goResourcesContent
  };
};

/**
 * 将最新生成的 SDK IR 与 TypeScript / Go 生成代码写入磁盘。
 */
export const writeSdkArtifacts = async (): Promise<GeneratedArtifacts> => {
  const artifacts = await compileSdkArtifacts();
  await Promise.all([
    fs.mkdir(path.dirname(artifacts.irPath), { recursive: true }),
    fs.mkdir(path.dirname(artifacts.typesPath), { recursive: true }),
    fs.mkdir(path.dirname(artifacts.goModelsPath), { recursive: true })
  ]);
  await Promise.all([
    fs.writeFile(artifacts.irPath, artifacts.irContent, 'utf8'),
    fs.writeFile(artifacts.typesPath, artifacts.typesContent, 'utf8'),
    fs.writeFile(artifacts.resourcesPath, artifacts.resourcesContent, 'utf8'),
    fs.writeFile(artifacts.goModelsPath, artifacts.goModelsContent, 'utf8'),
    fs.writeFile(artifacts.goResourcesPath, artifacts.goResourcesContent, 'utf8')
  ]);
  return artifacts;
};

/**
 * 校验磁盘已提交的 IR 与生成代码是否与最新 OpenAPI 契约零漂移一致。
 */
export const checkSdkArtifactsDrift = async (): Promise<{ driftedFiles: string[] }> => {
  const artifacts = await compileSdkArtifacts();
  const pairs: Array<[string, string]> = [
    [artifacts.irPath, artifacts.irContent],
    [artifacts.typesPath, artifacts.typesContent],
    [artifacts.resourcesPath, artifacts.resourcesContent],
    [artifacts.goModelsPath, artifacts.goModelsContent],
    [artifacts.goResourcesPath, artifacts.goResourcesContent]
  ];

  const driftedFiles: string[] = [];
  for (const [filePath, expectedContent] of pairs) {
    const existing = await fs.readFile(filePath, 'utf8').catch(() => null);
    if (existing !== expectedContent) {
      driftedFiles.push(filePath);
    }
  }

  return { driftedFiles };
};
