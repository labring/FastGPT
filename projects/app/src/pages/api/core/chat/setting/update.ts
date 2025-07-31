import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import type { ChatSettingSchema } from '@fastgpt/global/core/chat/type';
import { refreshSourceAvatar } from '@fastgpt/service/common/file/image/controller';
import { MongoChatSetting } from '@fastgpt/service/core/chat/setting/schema';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const body = req.body as Partial<ChatSettingSchema>;
  const { teamId } = await authCert({ req, authToken: true });

  // Get current settings to compare old URLs
  const currentSettings = await MongoChatSetting.findOne({ teamId });
  
  // Handle TTL removal for uploaded logos
  if (body.wideLogoUrl && currentSettings?.wideLogoUrl !== body.wideLogoUrl) {
    await refreshSourceAvatar(body.wideLogoUrl, currentSettings?.wideLogoUrl);
  }
  
  if (body.squareLogoUrl && currentSettings?.squareLogoUrl !== body.squareLogoUrl) {
    await refreshSourceAvatar(body.squareLogoUrl, currentSettings?.squareLogoUrl);
  }

  // Update or create chat settings
  const updatedSettings = await MongoChatSetting.findOneAndUpdate(
    { teamId },
    { 
      ...body,
      teamId,
      updateTime: new Date()
    },
    { 
      upsert: true, 
      new: true 
    }
  );

  res.status(200).json(updatedSettings);
}

export default NextAPI(handler);