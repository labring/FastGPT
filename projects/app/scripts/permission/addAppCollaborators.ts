import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { PerResourceTypeEnum, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';

const APP_COLLECTION_NAME = 'apps';
const RESOURCE_PERMISSION_COLLECTION_NAME = 'resource_permissions';
const DEFAULT_COLLABORATOR_LIMIT = 50;

type Options = {
  appId: string;
  memberLimit: number;
  dryRun: boolean;
  uri: string;
};

type AppRecord = {
  _id: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
};

type TeamMemberRecord = {
  _id: mongoose.Types.ObjectId;
};

const parseOptions = (args: string[]): Options => {
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
  let appId: string | undefined;
  let memberLimit = DEFAULT_COLLABORATOR_LIMIT;
  let dryRun = true;

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const arg = normalizedArgs[index];
    if (arg === '--execute') {
      dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const rawLimit = arg === '--limit' ? normalizedArgs[++index] : arg.slice('--limit='.length);
      const parsedLimit = Number(rawLimit);
      if (
        !rawLimit ||
        !/^\d+$/.test(rawLimit) ||
        !Number.isSafeInteger(parsedLimit) ||
        parsedLimit < 1
      ) {
        throw new Error(`Invalid --limit: ${rawLimit ?? ''}`);
      }
      memberLimit = parsedLimit;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  MONGODB_URI=<uri> pnpm --filter @fastgpt/app run permission:add-app-collaborators -- <appId> [--limit <number>] [--dry-run|--execute]',
          '',
          `The default mode is dry-run. Randomly add up to ${DEFAULT_COLLABORATOR_LIMIT} team members as app collaborators by default.`,
          'Existing collaborator permissions are preserved.'
        ].join('\n')
      );
      process.exit(0);
    }
    if (appId) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    appId = arg;
  }

  if (!appId) {
    throw new Error('appId is required');
  }
  if (!mongoose.isValidObjectId(appId)) {
    throw new Error(`Invalid appId: ${appId}`);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  return { appId, dryRun, memberLimit, uri };
};

const run = async ({ appId, dryRun, memberLimit, uri }: Options) => {
  await mongoose.connect(uri);

  try {
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB database connection is unavailable');

    const app = await database
      .collection<AppRecord>(APP_COLLECTION_NAME)
      .findOne({ _id: new mongoose.Types.ObjectId(appId) }, { projection: { _id: 1, teamId: 1 } });

    if (!app) {
      throw new Error(`App not found: ${appId}`);
    }

    // 随机选取指定数量的成员，不按 active/leave/forbidden 状态过滤。
    const teamMembers = await database
      .collection<TeamMemberRecord>(TeamMemberCollectionName)
      .aggregate<TeamMemberRecord>([
        { $match: { teamId: app.teamId } },
        { $sample: { size: memberLimit } },
        { $project: { _id: 1 } }
      ])
      .toArray();
    const memberIds = teamMembers.map((member) => member._id);
    const permissionCollection = database.collection(RESOURCE_PERMISSION_COLLECTION_NAME);
    const existingCount =
      memberIds.length === 0
        ? 0
        : await permissionCollection.countDocuments({
            teamId: app.teamId,
            resourceType: PerResourceTypeEnum.app,
            resourceId: app._id,
            tmbId: { $in: memberIds }
          });

    const result = {
      mode: dryRun ? 'dry-run' : 'execute',
      appId,
      teamId: String(app.teamId),
      memberLimit,
      memberCount: memberIds.length,
      existingCount,
      wouldInsertCount: Math.max(memberIds.length - existingCount, 0)
    };

    if (dryRun || memberIds.length === 0) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const writeResult = await permissionCollection.bulkWrite(
      memberIds.map((tmbId) => ({
        updateOne: {
          filter: {
            teamId: app.teamId,
            resourceType: PerResourceTypeEnum.app,
            resourceId: app._id,
            tmbId
          },
          update: {
            $setOnInsert: {
              permission: ReadRoleVal
            }
          },
          upsert: true
        }
      })),
      { ordered: false }
    );

    console.log(
      JSON.stringify(
        {
          ...result,
          insertedCount: writeResult.upsertedCount,
          matchedCount: writeResult.matchedCount,
          modifiedCount: writeResult.modifiedCount
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
