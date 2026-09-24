import { createHash, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  asRedisLogicalKey,
  redisCacheAdapter,
  type RedisCacheAdapter
} from '@fastgpt/dal/redis/adapter';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import type { DatasetArchiveManifest } from '@fastgpt/service/core/dataset/collection/archive/service';

export const DATASET_ARCHIVE_TICKET_TTL_MS = 60_000;
const MAX_TICKET_PAYLOAD_BYTES = 8 * 1024 * 1024;
const COMPRESSED_TICKET_PREFIX = 'gzip:v1:';

export type DatasetArchiveTicketPayload = {
  tmbId: string;
  teamId: string;
  datasetId: string;
  manifest: DatasetArchiveManifest;
};

type ArchiveTicketRedis = Pick<RedisCacheAdapter, 'set' | 'getAndDelete'>;

const getTicketKey = ({ tmbId, ticket }: { tmbId: string; ticket: string }) =>
  asRedisLogicalKey(
    'dataset-archive:ticket:' + tmbId + ':' + createHash('sha256').update(ticket).digest('hex')
  );

const parseTicketPayload = (value: string): DatasetArchiveTicketPayload | undefined => {
  const isManifest = (manifest: unknown): manifest is DatasetArchiveManifest => {
    if (typeof manifest !== 'object' || manifest === null) return false;

    const directories = Reflect.get(manifest, 'directories');
    const files = Reflect.get(manifest, 'files');
    return (
      Array.isArray(directories) &&
      directories.every((directory) => typeof directory === 'string') &&
      Array.isArray(files) &&
      files.every(
        (file) =>
          typeof file === 'object' &&
          file !== null &&
          typeof Reflect.get(file, 'key') === 'string' &&
          typeof Reflect.get(file, 'path') === 'string'
      )
    );
  };

  try {
    const serialized = (() => {
      if (!value.startsWith(COMPRESSED_TICKET_PREFIX)) return value;

      const encoded = value.slice(COMPRESSED_TICKET_PREFIX.length);
      if (!encoded) return undefined;
      return gunzipSync(Buffer.from(encoded, 'base64'), {
        maxOutputLength: MAX_TICKET_PAYLOAD_BYTES
      }).toString('utf8');
    })();
    if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_TICKET_PAYLOAD_BYTES) {
      return undefined;
    }

    const payload: unknown = JSON.parse(serialized);
    if (typeof payload !== 'object' || payload === null) {
      return undefined;
    }

    const tmbId = Reflect.get(payload, 'tmbId');
    const teamId = Reflect.get(payload, 'teamId');
    const datasetId = Reflect.get(payload, 'datasetId');
    const manifest = Reflect.get(payload, 'manifest');
    if (
      typeof tmbId !== 'string' ||
      typeof teamId !== 'string' ||
      typeof datasetId !== 'string' ||
      !isManifest(manifest)
    ) {
      return undefined;
    }
    return { tmbId, teamId, datasetId, manifest };
  } catch {
    return undefined;
  }
};

/**
 * 保存阶段一完成后的归档授权快照。Ticket 不包含可逆的权限信息，只能在短期内被绑定成员消费一次。
 */
export const createDatasetArchiveTicket = async ({
  tmbId,
  teamId,
  datasetId,
  manifest,
  redis = redisCacheAdapter,
  now = Date.now
}: DatasetArchiveTicketPayload & {
  redis?: ArchiveTicketRedis;
  now?: () => number;
}) => {
  const ticket = randomBytes(32).toString('base64url');
  const serialized = JSON.stringify({ tmbId, teamId, datasetId, manifest });
  const payloadBytes = Buffer.byteLength(serialized, 'utf8');
  if (payloadBytes > MAX_TICKET_PAYLOAD_BYTES) {
    throw DatasetErrEnum.archiveLimitExceeded;
  }
  const compressed = `${COMPRESSED_TICKET_PREFIX}${gzipSync(serialized).toString('base64')}`;

  await redis.set({
    key: getTicketKey({ tmbId, ticket }),
    value: compressed,
    ttlMs: DATASET_ARCHIVE_TICKET_TTL_MS
  });

  return {
    ticket,
    expiresAt: new Date(now() + DATASET_ARCHIVE_TICKET_TTL_MS).toISOString()
  };
};

/**
 * 原子消费 Ticket。调用方必须先获取下载 Lease，再调用此函数，避免槽位失败时提前销毁凭证。
 */
export const consumeDatasetArchiveTicket = async ({
  tmbId,
  ticket,
  redis = redisCacheAdapter
}: {
  tmbId: string;
  ticket: string;
  redis?: ArchiveTicketRedis;
}) => {
  const value = await redis.getAndDelete(getTicketKey({ tmbId, ticket }));
  if (!value) return undefined;
  const payload = parseTicketPayload(value);
  if (!payload || payload.tmbId !== tmbId) return undefined;
  return payload;
};
