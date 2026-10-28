import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

for (const suffix of ['.mdx', '.en.mdx']) {
  for (const topic of ['intro', 'dataset']) {
    test(`${topic}${suffix} curl examples emit valid request JSON`, () => {
      const source = fs.readFileSync(new URL(`../content/openapi/${topic}${suffix}`, import.meta.url), 'utf8');
      const blocks = [...source.matchAll(/```bash\n([\s\S]*?)\n```/g)].map((match) => match[1]);
      assert.equal(blocks.length, topic === 'intro' ? 1 : 2);
      for (const block of blocks) {
        // Replace curl before execution so examples never make a network request.
        const result = spawnSync('bash', ['-c', `curl() { cat; }\n${block}`], {
          encoding: 'utf8',
          env: { ...process.env, FASTGPT_ORIGIN: 'https://example.invalid', FASTGPT_API_KEY: 'EXAMPLE', FASTGPT_DATASET_ID: 'EXAMPLE_DATASET' }
        });
        assert.equal(result.status, 0, result.stderr);
        const body = JSON.parse(result.stdout);
        if (topic === 'intro') {
          assert.equal(body.appId, 'YOUR_APP_ID');
          assert.equal(body.stream, false);
          assert.equal(body.messages[0].role, 'user');
        } else {
          assert.ok(body.datasetId);
          assert.equal(typeof body.text, 'string');
          if (body.limit !== undefined) assert.ok(body.limit > 0);
        }
      }
    });
  }
}
