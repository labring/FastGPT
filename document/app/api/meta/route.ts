import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const docsRoot = path.resolve(process.cwd(), 'content/docs');

function isInvalidPage(str: string): boolean {
  if (!str || typeof str !== 'string') return true;
  if (/\[.*?\]\(.*?\)/.test(str) || /^https?:\/\//.test(str) || /[()]/.test(str)) return true;
  if (/^\s*---[\s\S]*---\s*$/.test(str)) return true;
  return false;
}

function getPageName(str: string): string {
  return str.startsWith('...') ? str.slice(3) : str;
}

async function findFirstValidPage(dirRelPath: string): Promise<string | null> {
  const absDir = path.join(docsRoot, dirRelPath);
  const metaPath = path.join(absDir, 'meta.json');

  try {
    const metaRaw = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(metaRaw);
    if (!Array.isArray(meta.pages)) return null;

    for (const page of meta.pages) {
      if (isInvalidPage(page)) continue;

      const pageName = getPageName(page);
      const pagePath = path.join(dirRelPath, pageName);

      const candidateDir = path.join(docsRoot, pagePath);
      const candidateFile = candidateDir + '.mdx';

      try {
        await fs.access(candidateFile);
        return pagePath;
      } catch {
        try {
          const stat = await fs.stat(candidateDir);
          if (stat.isDirectory()) {
            const recursiveResult = await findFirstValidPage(pagePath);
            if (recursiveResult) return recursiveResult;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rawPath = url.searchParams.get('path');

  if (!rawPath || !rawPath.startsWith('/docs')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  // 去除 /docs 前缀，且清理首尾斜杠
  const relPath = rawPath.replace(/^\/docs\/?/, '').replace(/^\/|\/$/g, '');

  try {
    // 先检测是否有该 mdx 文件
    const maybeFile = path.join(docsRoot, relPath + '.mdx');
    await fs.access(maybeFile);
    // 如果存在，返回完整路径（带 /docs）
    return NextResponse.json('/docs/' + relPath);
  } catch {
    // 不存在，尝试递归寻找第一个有效页面
    const found = await findFirstValidPage(relPath);
    if (found) {
      // 返回带 /docs 前缀的完整路径
      return NextResponse.json('/docs/' + found.replace(/\\/g, '/'));
    } else {
      return NextResponse.json({ error: 'No valid mdx page found' }, { status: 404 });
    }
  }
}
