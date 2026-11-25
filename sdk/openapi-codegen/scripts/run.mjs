import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] ?? 'generate';

const server = await createServer({
  root,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false }
});

try {
  const mod = await server.ssrLoadModule('/src/index.ts');
  if (command === 'generate') {
    const artifacts = await mod.writeSdkArtifacts();
    console.log(
      `[sdk:codegen] Generated:\n  - ${artifacts.irPath}\n  - ${artifacts.typesPath}\n  - ${artifacts.resourcesPath}\n  - ${artifacts.pythonModelsPath}\n  - ${artifacts.pythonResourcesPath}\n  - ${artifacts.goModelsPath}\n  - ${artifacts.goResourcesPath}`
    );
  } else if (command === 'check') {
    const { driftedFiles } = await mod.checkSdkArtifactsDrift();
    if (driftedFiles.length > 0) {
      console.error(
        `[sdk:codegen] Drift detected in:\n${driftedFiles.map((f) => `  - ${f}`).join('\n')}\nRun "pnpm sdk:gen" to update.`
      );
      process.exitCode = 1;
    } else {
      console.log(
        '[sdk:codegen] SDK IR and generated TypeScript/Python/Go sources are up to date.'
      );
    }
  } else {
    console.error(`Unknown command "${command}". Expected "generate" or "check".`);
    process.exitCode = 2;
  }
} finally {
  await server.close();
}
