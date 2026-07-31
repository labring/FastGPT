import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const SOURCE_COLLECTION = 'auth_codes';
const TARGET_COLLECTION = 'tmp_datas';
const LEGACY_EXPIRE_AFTER_MS = 5 * 60 * 1000;

const legacyAuthCodeTypes = new Set([
  'register',
  'findPassword',
  'wxLogin',
  'bindNotification',
  'captcha',
  'login'
]);

export type LegacyAuthCodeRecord = {
  key?: unknown;
  type?: unknown;
  code?: unknown;
  openid?: unknown;
  createTime?: unknown;
  expiredTime?: unknown;
};

type LegacyAuthCodeType =
  | 'register'
  | 'findPassword'
  | 'wxLogin'
  | 'bindNotification'
  | 'captcha'
  | 'login';

type VerificationRecord = {
  dataId: string;
  data: Record<string, string>;
  expireAt: Date;
};

export type LegacyAuthCodeMapping =
  | {
      kind: 'mapped';
      record: VerificationRecord;
    }
  | {
      kind: 'skipped';
      reason:
        | 'unsupported-type'
        | 'missing-key'
        | 'missing-code'
        | 'missing-openid'
        | 'missing-expiry'
        | 'expired';
    };

type MigrationOptions = {
  dryRun: boolean;
  uri: string;
};

type SkipReason =
  | 'unsupported-type'
  | 'missing-key'
  | 'missing-code'
  | 'missing-openid'
  | 'missing-expiry'
  | 'expired';

type MigrationStats = {
  scanned: number;
  mapped: number;
  inserted: number;
  existing: number;
  wouldInsert: number;
  duplicateSource: number;
  skipped: Record<SkipReason, number>;
};

const createStats = (): MigrationStats => ({
  scanned: 0,
  mapped: 0,
  inserted: 0,
  existing: 0,
  wouldInsert: 0,
  duplicateSource: 0,
  skipped: {
    'unsupported-type': 0,
    'missing-key': 0,
    'missing-code': 0,
    'missing-openid': 0,
    'missing-expiry': 0,
    expired: 0
  }
});

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

const toDate = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const getExpireAt = (record: LegacyAuthCodeRecord) => {
  const expiredTime = toDate(record.expiredTime);
  if (expiredTime) return expiredTime;

  const createTime = toDate(record.createTime);
  return createTime ? new Date(createTime.getTime() + LEGACY_EXPIRE_AFTER_MS) : undefined;
};

const getDataId = (scene: string, type: string, key: string) =>
  `verification:v1:${scene}:${type}:${key}`;

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

const isLegacyAuthCodeType = (value: unknown): value is LegacyAuthCodeType =>
  typeof value === 'string' && legacyAuthCodeTypes.has(value);

/** Convert one legacy record without exposing its key or verification material. */
export const mapLegacyAuthCode = (
  record: LegacyAuthCodeRecord,
  now = new Date()
): LegacyAuthCodeMapping => {
  if (!isLegacyAuthCodeType(record.type)) {
    return { kind: 'skipped', reason: 'unsupported-type' };
  }

  if (!isNonEmptyString(record.key)) {
    return { kind: 'skipped', reason: 'missing-key' };
  }

  const expireAt = getExpireAt(record);
  if (!expireAt) {
    return { kind: 'skipped', reason: 'missing-expiry' };
  }
  if (expireAt.getTime() <= now.getTime()) {
    return { kind: 'skipped', reason: 'expired' };
  }

  if (record.type === 'captcha') {
    if (!isNonEmptyString(record.code)) {
      return { kind: 'skipped', reason: 'missing-code' };
    }

    return {
      kind: 'mapped',
      record: {
        dataId: getDataId('register', 'captcha', record.key),
        data: { code: record.code.toLowerCase() },
        expireAt
      }
    };
  }

  if (record.type === 'wxLogin') {
    if (!isNonEmptyString(record.openid)) {
      return { kind: 'skipped', reason: 'missing-openid' };
    }

    return {
      kind: 'mapped',
      record: {
        dataId: getDataId('login', 'wechat', hashKey(record.key)),
        data: { openId: record.openid },
        expireAt
      }
    };
  }

  if (!isNonEmptyString(record.code)) {
    return { kind: 'skipped', reason: 'missing-code' };
  }

  if (record.type === 'login') {
    return {
      kind: 'mapped',
      record: {
        dataId: getDataId('login', 'password', record.key),
        data: { preLoginCode: record.code },
        expireAt
      }
    };
  }

  const scene = record.type === 'findPassword' ? 'forgetPassword' : record.type;
  return {
    kind: 'mapped',
    record: {
      dataId: getDataId(scene, 'code', record.key),
      data: { code: record.code },
      expireAt
    }
  };
};

const parseOptions = (args: string[]): MigrationOptions => {
  let dryRun = true;

  for (const arg of args[0] === '--' ? args.slice(1) : args) {
    if (arg === '--execute') {
      dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  MONGODB_URI=<uri> pnpm --filter @fastgpt/app run migrate:auth-code -- [--dry-run|--execute]',
          '',
          'The default mode is dry-run. Use --execute to write to tmp_datas.',
          'The source auth_codes collection is never deleted.'
        ].join('\n')
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  return { dryRun, uri };
};

const isDuplicateKeyError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000;

type MongoCollection = ReturnType<NonNullable<typeof mongoose.connection.db>['collection']>;

const upsertOnInsert = async (collection: MongoCollection, record: VerificationRecord) => {
  try {
    const result = await collection.updateOne(
      { dataId: record.dataId },
      {
        $setOnInsert: record
      },
      { upsert: true }
    );

    return result.upsertedCount > 0;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const existing = await collection.findOne(
      { dataId: record.dataId },
      { projection: { _id: 1 } }
    );
    if (!existing) throw error;

    return false;
  }
};

const run = async ({ dryRun, uri }: MigrationOptions) => {
  await mongoose.connect(uri);

  try {
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB database connection is unavailable');

    const sourceExists = await database
      .listCollections({ name: SOURCE_COLLECTION }, { nameOnly: true })
      .hasNext();
    if (!sourceExists) {
      console.log(`Collection ${SOURCE_COLLECTION} does not exist; nothing to migrate.`);
      return;
    }

    const sourceCollection = database.collection(SOURCE_COLLECTION);
    const targetCollection = database.collection(TARGET_COLLECTION);
    const stats = createStats();
    const seenDataIds = new Set<string>();
    const cursor = sourceCollection.find({}).sort({ createTime: -1, _id: -1 });

    for await (const rawRecord of cursor) {
      stats.scanned += 1;
      const mapping = mapLegacyAuthCode(rawRecord as LegacyAuthCodeRecord);

      if (mapping.kind === 'skipped') {
        stats.skipped[mapping.reason] += 1;
        continue;
      }

      stats.mapped += 1;
      if (seenDataIds.has(mapping.record.dataId)) {
        stats.duplicateSource += 1;
        continue;
      }
      seenDataIds.add(mapping.record.dataId);

      if (dryRun) {
        stats.wouldInsert += 1;
        continue;
      }

      if (await upsertOnInsert(targetCollection, mapping.record)) {
        stats.inserted += 1;
      } else {
        stats.existing += 1;
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: dryRun ? 'dry-run' : 'execute',
          sourceCollection: SOURCE_COLLECTION,
          targetCollection: TARGET_COLLECTION,
          stats
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.disconnect();
  }
};

const isMain =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const main = async () => run(parseOptions(process.argv.slice(2)));

  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
