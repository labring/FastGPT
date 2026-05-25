const http = require('http');
const fs = require('fs');

const GITLAB_PRIVATE_TOKEN = process.env.GITLAB_PRIVATE_TOKEN || '**';
const GITLAB_BASE_URL = process.env.GITLAB_BASE_URL || 'http://mq.code.sangfor.org';
const GITLAB_PROJECT_ID = process.env.GITLAB_PROJECT_ID || '15836';
const GITLAB_TARGET_BRANCH = process.env.GITLAB_TARGET_BRANCH || 'develop-1.3.0';
const branch = process.env.BRANCH || '';
const tdId = process.env.TD_ID || '';

if (!branch || !tdId) {
  console.error('❌ 请设置 BRANCH 和 TD_ID 环境变量');
  process.exit(1);
}

const tdUrl = 'https://td.sangfor.com/#/defect/details/' + tdId;
const tdFile = '.frieren/agent-tasks/TD/' + tdId + '.md';

let tdContent = '';
try {
  tdContent = fs.readFileSync(tdFile, 'utf8');
} catch (e) {
  console.error('⚠ TD 文档不存在: ' + tdFile);
}

const firstHeading = (tdContent.split('\n').find(l => l.match(/^####/)) || '')
  .replace(/^####\s*【/, '')
  .replace(/】.*/, '');

const title = 'WIP: fix: ' + tdId + ' ' + firstHeading;
const description = 'TD 链接: ' + tdUrl + '\n\n' + tdContent;

const body = JSON.stringify({
  source_branch: branch,
  target_branch: GITLAB_TARGET_BRANCH,
  title: title,
  description: description,
  remove_source_branch: true
});

const baseUrl = GITLAB_BASE_URL.replace(/\/+$/, '');
const u = new URL(baseUrl + '/api/v4/projects/' + GITLAB_PROJECT_ID + '/merge_requests');

const options = {
  hostname: u.hostname,
  port: u.port || 80,
  path: u.pathname,
  method: 'POST',
  headers: {
    'PRIVATE-TOKEN': GITLAB_PRIVATE_TOKEN,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      if (result.web_url) {
        console.log('✅ MR Created!');
        console.log('MR URL:', result.web_url);
        console.log('MR IID:', result.iid);
      } else {
        console.log('❌ Failed:', JSON.stringify(result, null, 2));
      }
    } catch (e) {
      console.log('❌ Response:', data);
    }
  });
});
req.on('error', (e) => console.error('❌ Error:', e.message));
req.write(body);
req.end();
