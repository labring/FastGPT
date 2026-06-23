import { execFile, execFileSync } from 'child_process';
import { platform } from 'os';
import { readdirSync, readFileSync } from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
export const PROCESS_GROUP_SUPPORTED = platform() !== 'win32';

export function readLinuxRSSKB(pid: number): number | null {
  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf-8');
    const match = status.match(/VmRSS:\s+(\d+)\s+kB/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

export function getLinuxChildPids(pid: number): number[] {
  const children = new Set<number>();
  try {
    const taskIds = readdirSync(`/proc/${pid}/task`);
    for (const taskId of taskIds) {
      try {
        const content = readFileSync(`/proc/${pid}/task/${taskId}/children`, 'utf-8');
        for (const child of content.trim().split(/\s+/)) {
          const childPid = Number(child);
          if (Number.isInteger(childPid) && childPid > 0) {
            children.add(childPid);
          }
        }
      } catch {}
    }
  } catch {}
  return [...children];
}

export function getChildPids(pid: number): number[] {
  if (platform() === 'linux') {
    return getLinuxChildPids(pid);
  }

  try {
    const stdout = execFileSync('pgrep', ['-P', String(pid)], {
      encoding: 'utf-8',
      timeout: 1000
    });
    return stdout
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

export function getDescendantPids(rootPid: number): number[] {
  const descendants: number[] = [];
  const queue = [rootPid];
  const seen = new Set<number>(queue);

  while (queue.length > 0) {
    const parentPid = queue.shift()!;
    for (const childPid of getChildPids(parentPid)) {
      if (seen.has(childPid)) continue;
      seen.add(childPid);
      descendants.push(childPid);
      queue.push(childPid);
    }
  }

  return descendants;
}

export async function getProcessTreeRSSMB(pid: number): Promise<number | null> {
  const pids = [pid, ...getDescendantPids(pid)];
  if (pids.length === 0) return null;

  try {
    if (platform() === 'linux') {
      let totalKB = 0;
      for (const currentPid of pids) {
        const rssKB = readLinuxRSSKB(currentPid);
        if (rssKB !== null) totalKB += rssKB;
      }
      return totalKB > 0 ? totalKB / 1024 : null;
    }

    const { stdout } = await execFileAsync('ps', ['-o', 'rss=', '-p', pids.join(',')], {
      timeout: 2000
    });
    const totalKB = stdout
      .split('\n')
      .map((line) => parseInt(line.trim(), 10))
      .filter((rssKB) => !isNaN(rssKB))
      .reduce((sum, rssKB) => sum + rssKB, 0);
    return totalKB > 0 ? totalKB / 1024 : null;
  } catch {
    return null;
  }
}

export function killProcessTree(pid?: number): void {
  if (!pid) return;

  const descendantPids = getDescendantPids(pid).reverse();
  for (const childPid of descendantPids) {
    try {
      process.kill(childPid, 'SIGKILL');
    } catch {}
  }

  if (PROCESS_GROUP_SUPPORTED) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {}
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
}
