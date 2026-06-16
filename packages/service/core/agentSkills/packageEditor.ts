/**
 * Skill Package Editor
 *
 * Direct zip CRUD on MinIO `package.zip` via JSZip in-memory mutate pipeline.
 * Each mutate call = download full zip -> JSZip modify -> re-upload to same key.
 *
 * Concurrency:
 * - In-process: serialized by withSkillEditLock per skillId.
 * - Cross-process: serialized by MongoDB-based editLock (acquireSkillEditLock).
 */
import JSZip from 'jszip';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { AgentSkillSchemaType } from '@fastgpt/global/core/agentSkills/type';
import { downloadSkillPackage, uploadSkillPackage } from './storage';
import { checkHeapHeadroom } from './sandboxConfig';
import { updateCurrentStorage } from './controller';
import { MongoAgentSkillsVersion } from './version/schema';
import { MongoAgentSkills } from './schema';
import { acquireSkillEditLock, releaseSkillEditLock, renewSkillEditLock } from './editLock';

export type PackageFileItem = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
};

/** Validate client-supplied zip-internal path. Rejects absolute, `..`, backslash. */
export function validatePackagePath(path: string, opts: { allowRoot?: boolean } = {}): string {
  if (path === undefined || path === null) {
    throw new UserError('Path is required');
  }
  if (path === '' || path === '.') {
    if (opts.allowRoot) return '';
    throw new UserError('Path is required');
  }
  if (path.startsWith('/')) {
    throw new UserError('Path must be relative');
  }
  if (path.includes('\\')) {
    throw new UserError('Path must not contain backslash');
  }
  const segments = path.split('/');
  for (const seg of segments) {
    if (seg === '..') {
      throw new UserError('Path must not contain ".."');
    }
  }
  return path.replace(/\/+$/, '');
}

/** Recursively list all files and directories nested under `path` inside zip. */
export function listZipAllFiles(zip: JSZip, path: string): PackageFileItem[] {
  const items = listZipDirectory(zip, path);
  return items.map((item) => {
    if (item.type === 'directory') {
      return { ...item, children: listZipAllFiles(zip, item.path) };
    }
    return item;
  });
}

/** List direct children of `path` inside zip. Implicit directories are detected. */
export function listZipDirectory(zip: JSZip, path: string): PackageFileItem[] {
  const prefix = path === '' ? '' : path.replace(/\/+$/, '') + '/';

  const fileMap = new Map<string, PackageFileItem>();
  for (const [key, entry] of Object.entries(zip.files)) {
    if (prefix !== '' && !key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (!rest) continue;

    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) {
      if (entry.dir) {
        fileMap.set(rest, { name: rest, path: prefix + rest, type: 'directory' });
      } else {
        const uncompressed = (entry as unknown as { _data?: { uncompressedSize?: number } })._data
          ?.uncompressedSize;
        fileMap.set(rest, {
          name: rest,
          path: prefix + rest,
          type: 'file',
          size: typeof uncompressed === 'number' ? uncompressed : undefined
        });
      }
    } else if (slashIdx === rest.length - 1) {
      const dirName = rest.slice(0, slashIdx);
      if (!fileMap.has(dirName)) {
        fileMap.set(dirName, { name: dirName, path: prefix + dirName, type: 'directory' });
      }
    } else {
      const dirName = rest.slice(0, slashIdx);
      const existing = fileMap.get(dirName);
      if (!existing || existing.type !== 'directory') {
        fileMap.set(dirName, { name: dirName, path: prefix + dirName, type: 'directory' });
      }
    }
  }

  return Array.from(fileMap.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Read a single file from zip; returns null if not found. */
export async function readZipFile(zip: JSZip, path: string): Promise<Buffer | null> {
  const file = zip.file(path);
  if (!file) return null;
  return file.async('nodebuffer');
}

/** Load zip → apply mutator → re-pack. */
export async function mutateZip(
  zipBuffer: Buffer,
  mutator: (zip: JSZip) => Promise<void> | void
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(zipBuffer);
  await mutator(zip);
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

export function zipWriteText(zip: JSZip, path: string, text: string): void {
  zip.file(path, text);
}

export function zipWriteBinary(zip: JSZip, path: string, content: Buffer): void {
  zip.file(path, content);
}

/** Delete a file or directory tree. Silent no-op when path doesn't exist. */
export function zipDeleteRecursive(zip: JSZip, path: string): void {
  const normalized = path.replace(/\/+$/, '');
  zip.remove(normalized);
  zip.remove(normalized + '/');
  const prefix = normalized + '/';
  for (const key of Object.keys(zip.files)) {
    if (key.startsWith(prefix)) {
      zip.remove(key);
    }
  }
}

/** Rename / move a single file or entire directory. Throws when source missing. */
export async function zipRename(zip: JSZip, fromPath: string, toPath: string): Promise<void> {
  const from = fromPath.replace(/\/+$/, '');
  const to = toPath.replace(/\/+$/, '');
  if (from === to) return;

  const fileEntry = zip.file(from);
  if (fileEntry) {
    const buf = await fileEntry.async('nodebuffer');
    zip.file(to, buf);
    zip.remove(from);
    return;
  }

  const fromPrefix = from + '/';
  const toPrefix = to + '/';
  const matchedKeys: string[] = [];
  for (const key of Object.keys(zip.files)) {
    if (key === fromPrefix || key.startsWith(fromPrefix)) {
      matchedKeys.push(key);
    }
  }
  if (matchedKeys.length === 0) {
    throw new UserError(`Entry not found: ${fromPath}`);
  }
  // Snapshot entries before mutation — JSZip's internal .files may be lazy
  const snapshots: { key: string; isDir: boolean; data?: Buffer }[] = [];
  for (const key of matchedKeys) {
    const entry = zip.files[key];
    if (!entry) continue;
    snapshots.push({
      key,
      isDir: entry.dir,
      data: entry.dir ? undefined : await entry.async('nodebuffer')
    });
  }
  for (const { key, isDir, data } of snapshots) {
    const newKey = toPrefix + key.slice(fromPrefix.length);
    if (isDir) {
      zip.folder(newKey.replace(/\/+$/, ''));
    } else {
      zip.file(newKey, data as Buffer);
    }
    zip.remove(key);
  }
}

/** Create an explicit directory entry. No-op when already exists. */
export function zipMkdir(zip: JSZip, path: string): void {
  const normalized = path.replace(/\/+$/, '');
  zip.folder(normalized);
}

// =========================================================================
// In-process serialization lock (per skillId)
// =========================================================================

const skillLocks = new Map<string, Promise<unknown>>();

export async function withSkillEditLock<T>(skillId: string, fn: () => Promise<T>): Promise<T> {
  const prev = skillLocks.get(skillId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  const chained = prev.then(() => next);
  skillLocks.set(skillId, chained);
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (skillLocks.get(skillId) === chained) {
      skillLocks.delete(skillId);
    }
  }
}

// =========================================================================
// Generic mutate pipeline
// =========================================================================

export type EditCurrentPackageResult = { success: true; size: number; packageVersion: number };

export async function editCurrentPackage(params: {
  skill: AgentSkillSchemaType;
  teamId: string;
  mutator: (zip: JSZip) => Promise<void> | void;
}): Promise<EditCurrentPackageResult> {
  const { skill, teamId, mutator } = params;
  const skillId = String((skill as AgentSkillSchemaType & { _id: unknown })._id);
  const version = skill.currentVersion ?? 0;

  if (!skill.currentStorage || !skill.currentStorage.key) {
    throw new UserError('Skill has no active version');
  }

  return withSkillEditLock(skillId, async () => {
    // Acquire distributed lock for cross-replica protection
    const lockHandle = await acquireSkillEditLock(skillId);

    try {
      // Re-read skill inside lock to get the latest currentStorage
      const freshSkill = await MongoAgentSkills.findOne({
        _id: skillId,
        teamId,
        deleteTime: null
      });

      if (!freshSkill || !freshSkill.currentStorage || !freshSkill.currentStorage.key) {
        throw new UserError('Skill has no active version');
      }

      const oldBuffer = await downloadSkillPackage({ storageInfo: freshSkill.currentStorage });

      // Renew lock before mutation (download may have been slow)
      await renewSkillEditLock(lockHandle);

      // JSZip.loadAsync + generateAsync can triple the in-memory footprint
      // (raw buffer + internal JSZip representation + new buffer).
      // Check with 2× the actual size as a conservative estimate.
      checkHeapHeadroom(oldBuffer.length * 2);

      const newBuffer = await mutateZip(oldBuffer, mutator);

      // Renew lock before upload (mutation may have been slow for large ZIPs)
      await renewSkillEditLock(lockHandle);

      const storage = await uploadSkillPackage({
        teamId,
        skillId,
        version,
        zipBuffer: newBuffer
      });

      await updateCurrentStorage(skillId, storage);
      await MongoAgentSkillsVersion.updateOne(
        { skillId, version },
        {
          $set: {
            'storage.size': storage.size,
            'storage.key': storage.key,
            'storage.bucket': storage.bucket
          }
        }
      );

      // Bump packageVersion and read back the new value.
      // packageVersion is a Mongoose-only field not present in the Zod-derived type.
      const updated = await MongoAgentSkills.findOneAndUpdate(
        { _id: skillId },
        { $inc: { packageVersion: 1 } } as any,
        { new: true, projection: { packageVersion: 1 } }
      );
      const newPackageVersion = (updated as any)?.packageVersion ?? 0;

      return { success: true, size: storage.size, packageVersion: newPackageVersion };
    } finally {
      await releaseSkillEditLock(lockHandle);
    }
  });
}
