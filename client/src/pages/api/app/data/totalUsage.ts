import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, Bill } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { Types } from 'mongoose';
import dayjs from 'dayjs';
import { addDays, isSameDay } from 'date-fns';

const fillMissingDates = (start: number, end: number, data: { date: Date; total: number }[]) => {
  const result: { date: Date; total: number }[] = [];
  const dayStart = dayjs(start);
  const dayEnd = dayjs(end);
  const diff = +dayEnd.diff(dayStart, 'day');

  for (let i = 0; i < diff; i++) {
    const date = addDays(start, i);
    const dataItem = data.find((item) => isSameDay(date, item.date));
    result[i] = { date, total: dataItem?.total || 0 };
  }

  return result;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { appId, start, end } = req.body as { appId: string; start: number; end: number };
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const result = await Bill.aggregate([
      {
        $match: {
          appId: new Types.ObjectId(appId),
          userId: new Types.ObjectId(userId),
          time: { $gte: new Date(start) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$time' },
            month: { $month: '$time' },
            day: { $dayOfMonth: '$time' }
          },
          total: { $sum: '$total' }
        }
      },
      {
        $project: {
          _id: 0,
          date: { $dateFromParts: { year: '$_id.year', month: '$_id.month', day: '$_id.day' } },
          total: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    jsonRes(res, {
      data: fillMissingDates(start, end, result)
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
