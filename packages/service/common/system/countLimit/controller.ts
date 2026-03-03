import type z from 'zod';
import type { CountLimitTypeEnum } from './type';
import { CountLimitConfig } from './const';
import { MongoCountLimit } from './schema';
import { mongoSessionRun } from '../../mongo/sessionRun';

/**
 * Update the count limit for a specific type and key.
 * @param param0 - The type, key, and update value.
 * @returns The updated count limit information.
 */
export const updateCountLimit = async ({
  type,
  key,
  update
}: {
  type: z.infer<typeof CountLimitTypeEnum>;
  key: string;
  update: number;
}) =>
  mongoSessionRun(async (session) => {
    const maxCount = CountLimitConfig[type].maxCount;
    const countLimit = await MongoCountLimit.findOne(
      {
        type,
        key
      },
      undefined,
      {
        session
      }
    ).lean();

    if (!countLimit) {
      // do not exist, create a new one
      await MongoCountLimit.create(
        [
          {
            type,
            key,
            count: update // 0 + update
          }
        ],
        {
          session
        }
      );
      return {
        maxCount,
        nowCount: update,
        remain: maxCount - update
      };
    }

    if (countLimit.count >= maxCount) {
      return Promise.reject(`Max Count Reached, type: ${type}, key: ${key}`);
    }

    await MongoCountLimit.updateOne(
      {
        type,
        key
      },
      {
        $inc: { count: update }
      },
      { session }
    );

    return {
      maxCount,
      nowCount: countLimit.count + update,
      remain: maxCount - (countLimit.count + update)
    };
  });

/** Clean the Count limit, if no key provided, clean all the type */
export const cleanCountLimit = async ({ teamId }: { teamId: string }) =>
  MongoCountLimit.deleteMany({
    key: teamId
  });
