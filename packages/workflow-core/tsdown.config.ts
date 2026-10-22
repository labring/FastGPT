import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    'command/apply': 'src/command/apply.ts',
    'command/applyChangeSet': 'src/command/applyChangeSet.ts',
    'command/mergeChangeSet': 'src/command/mergeChangeSet.ts',
    'command/type': 'src/command/type.ts',
    'code/io': 'src/code/io.ts',
    'binding/service': 'src/binding/service.ts',
    'binding/type': 'src/binding/type.ts',
    'domain/checksum': 'src/domain/checksum.ts',
    'domain/diagnostic': 'src/domain/diagnostic.ts',
    'domain/document': 'src/domain/document.ts',
    'domain/defaults': 'src/domain/defaults.ts',
    'edge/compiler': 'src/edge/compiler.ts',
    'edge/parser': 'src/edge/parser.ts',
    'edge/validation': 'src/edge/validation.ts',
    'node/removal': 'src/node/removal.ts',
    'reference/query': 'src/reference/query.ts',
    'reference/type': 'src/reference/type.ts',
    'reference/validation': 'src/reference/validation.ts',
    'nesting/query': 'src/nesting/query.ts',
    'config/automationMeta': 'src/config/automationMeta.ts',
    'config/descriptor': 'src/config/descriptor.ts',
    'config/type': 'src/config/type.ts',
    'store/compile': 'src/store/compile.ts',
    'store/decompile': 'src/store/decompile.ts',
    'template/descriptor': 'src/template/descriptor.ts',
    'template/defaultValue': 'src/template/defaultValue.ts',
    'template/instantiate': 'src/template/instantiate.ts',
    'template/provider': 'src/template/provider.ts',
    'template/type': 'src/template/type.ts',
    'template/valueSchema': 'src/template/valueSchema.ts',
    validation: 'src/validation/index.ts',
    'validation/model': 'src/validation/model.ts'
  },
  format: 'esm',
  dts: {
    enabled: true,
    sourcemap: false
  },
  outExtensions: () => ({ js: '.js', dts: '.d.ts' })
});
