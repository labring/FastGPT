import { z } from 'zod';
import { BoolSchema } from '../../common/zod';
import { TrackEnum } from '../../common/middle/tracks/constants';

export const OutLinkBrandTrackEventSchema = z
  .enum([TrackEnum.shareBrandExposure, TrackEnum.shareBrandClick])
  .meta({
    description: '分享链接品牌事件，仅接受品牌曝光和品牌点击',
    example: TrackEnum.shareBrandExposure
  });
export type OutLinkBrandTrackEventType = z.infer<typeof OutLinkBrandTrackEventSchema>;

/** 分享链接品牌偏好；缺失代表历史豁免，不能在校验时补默认值。 */
export const OutLinkBrandConfigSchema = z.object({
  isShowBrand: BoolSchema.optional().meta({
    description: '用户保存的 FastGPT 水印展示偏好；实际展示结合套餐权益计算，缺失表示历史链接豁免',
    example: true
  })
});
export type OutLinkBrandConfigType = z.infer<typeof OutLinkBrandConfigSchema>;

export const OutLinkBrandingSchema = z.object({
  enabled: BoolSchema.meta({ description: '是否启用分享链接品牌功能', example: true }),
  showBrand: BoolSchema.meta({ description: '本次初始化是否展示品牌', example: true })
});
export type OutLinkBrandingType = z.infer<typeof OutLinkBrandingSchema>;
