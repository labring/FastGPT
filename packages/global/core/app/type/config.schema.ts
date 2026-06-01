import z from 'zod';
import { BoolSchema, IntSchema } from '../../../common/zod';

/* app chat file select config type */
export const AppFileSelectConfigTypeSchema = z.object({
  maxFiles: IntSchema.optional().meta({
    description: '单次对话允许选择的最大文件数量'
  }),
  canSelectFile: BoolSchema.optional().meta({
    description: '是否允许在对话中选择普通文件'
  }),
  customPdfParse: BoolSchema.optional().meta({
    description: '是否使用自定义 PDF 解析配置'
  }),
  canSelectImg: BoolSchema.optional().meta({
    description: '是否允许在对话中选择图片'
  }),
  canSelectVideo: BoolSchema.optional().meta({
    description: '是否允许在对话中选择视频'
  }),
  canSelectAudio: BoolSchema.optional().meta({
    description: '是否允许在对话中选择音频'
  }),
  canSelectCustomFileExtension: BoolSchema.optional().meta({
    description: '是否允许选择自定义扩展名的文件'
  }),
  customFileExtensionList: z.array(z.string()).optional().meta({
    description: '允许选择的自定义文件扩展名列表'
  })
});
export type AppFileSelectConfigType = z.infer<typeof AppFileSelectConfigTypeSchema>;
