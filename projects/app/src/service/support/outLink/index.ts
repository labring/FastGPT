import { addLog } from '@/service/utils/tools';
import { OutLink } from './schema';

export const updateOutLinkUsage = async ({
  shareId,
  total
}: {
  shareId: string;
  total: number;
}) => {
  try {
    await OutLink.findOneAndUpdate(
      { shareId },
      {
        $inc: { total },
        lastTime: new Date()
      }
    );
  } catch (err) {
    addLog.error('update shareChat error', err);
  }
};
