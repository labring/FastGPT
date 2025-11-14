// translate-mdx.js
import fs from 'fs-extra';
import path from 'path';
import fetch from 'node-fetch';
import { globby } from 'globby';

import pLimit from 'p-limit';

const API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const API_KEY = ''; // 替换为你的密钥
const MODEL_NAME = 'Qwen/QwQ-32B';

const limit = pLimit(2); // 限制并发翻译数量

async function translateMDX(filePath) {
  const newFilePath = filePath.replace(/\.mdx$/, '.en.mdx');

  // 如果英文翻译文件已存在，则跳过
  if (await fs.pathExists(newFilePath)) {
    console.log(`⚠️ Skip translation, file exists: ${newFilePath}`);
    return;
  }

  const rawText = await fs.readFile(filePath, 'utf-8');

  const body = {
    model: MODEL_NAME,
    messages: [
      {
        role: 'system',
        content:
          'You are a professional translator. Please translate the following MDX content into English and keep the MDX syntax unchanged.'
      },
      {
        role: 'user',
        content: rawText
      }
    ]
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`API request failed with status ${res.status}`);
  }

  const result = await res.json();
  const translated = result?.choices?.[0]?.message?.content;

  if (!translated) {
    throw new Error('No translation result returned from API');
  }

  await fs.writeFile(newFilePath, translated, 'utf-8');
  console.log(`✅ Translated: ${filePath} → ${newFilePath}`);
}

async function translateAllMDXFiles(targetDir) {
  // 排除 *.en.mdx 文件，避免重复翻译
  const files = await globby([`${targetDir}/**/*.mdx`, `!${targetDir}/**/*.en.mdx`]);

  if (files.length === 0) {
    console.log('⚠️ No MDX files found.');
    return;
  }

  console.log(`🚀 Found ${files.length} .mdx files. Starting translation...`);

  const tasks = files.map((file) =>
    limit(() =>
      translateMDX(file).catch((err) =>
        console.error(`❌ Failed to translate ${file}: ${err.message}`)
      )
    )
  );

  await Promise.all(tasks);
  console.log('🎉 All translations completed!');
}

// 执行入口
const targetDir = process.argv[2] || './content/docs/agreement'; // 默认目录
translateAllMDXFiles(targetDir);
