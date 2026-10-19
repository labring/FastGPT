const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../lib/i18n.ts');
const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
});
const moduleExports = {};
vm.runInNewContext(outputText, {
  exports: moduleExports,
  require: (id) => {
    // 栏目识别不依赖站点构建配置或 Next 路由，隔离这两个模块即可直接测试实际实现。
    assert.ok(['./site', 'next/navigation'].includes(id), `Unexpected import: ${id}`);
    return {};
  }
}, { filename });
const { getDocCategoryKey } = moduleExports;

test('category keys match for prefixed and unprefixed document routes', () => {
  for (const category of ['guide', 'plugin', 'self-host', 'openapi']) {
    for (const prefix of ['', '/en', '/zh-CN']) {
      assert.equal(getDocCategoryKey(`${prefix}/${category}`), category);
      assert.equal(getDocCategoryKey(`${prefix}/${category}/intro/`), category);
    }
  }
});

test('category keys handle empty routes and only strip configured locale segments', () => {
  for (const pathname of ['', '/', '/en', '/en/', '/zh-CN/']) {
    assert.equal(getDocCategoryKey(pathname), '');
  }
  assert.equal(getDocCategoryKey('/enough/intro'), 'enough');
  assert.equal(getDocCategoryKey('/ja/intro'), 'ja');
});
