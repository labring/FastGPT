// lib/github.ts
import { getGithubLastEdit } from 'fumadocs-core/server';

export async function fetchLastModified(path: string): Promise<string | null> {
  try {
    const lastEdit = await getGithubLastEdit({
      owner: process.env.GITHUB_OWNER || 'labring',
      repo: process.env.GITHUB_REPO || 'FastGPT',
      path,
      token: `Bearer ${process.env.GIT_TOKEN}` // 可选，提高速率限制
    });
    return lastEdit ? lastEdit.toISOString() : null;
  } catch (err) {
    console.error('获取 GitHub 最后编辑时间失败', err);
    return null;
  }
}
