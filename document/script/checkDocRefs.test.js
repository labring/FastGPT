const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('reference checker accepts locale routes and exclusions while rejecting missing destinations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-refs-'));
  try {
    fs.mkdirSync(path.join(root, 'script'));
    fs.mkdirSync(path.join(root, 'content'));
    fs.mkdirSync(path.join(root, 'public'));
    fs.copyFileSync(path.join(__dirname, 'checkDocRefs.js'), path.join(root, 'script/checkDocRefs.js'));
    fs.writeFileSync(path.join(root, 'content/meta.json'), JSON.stringify({ pages: ['index', '!reference'] }));
    fs.writeFileSync(path.join(root, 'content/index.mdx'), '[Reference](/zh-CN/reference)');
    fs.writeFileSync(path.join(root, 'content/reference.mdx'), '# Reference');
    const run = () => spawnSync(process.execPath, [path.join(root, 'script/checkDocRefs.js')], { encoding: 'utf8' });
    const valid = run();
    assert.equal(valid.status, 0, valid.stderr);
    fs.writeFileSync(path.join(root, 'content/index.mdx'), '[Missing](/zh-CN/missing)');
    assert.equal(run().status, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
