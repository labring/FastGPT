import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';

/* ============================================================================
 * API: 检查集合名称重复
 * Route: POST /api/core/dataset/collection/check/duplicate
 * ============================================================================ */
export const CheckDuplicateFileNamesBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  parentId: z.string().optional().meta({
    example: '68ad85a7463006c963799a06',
    description: '父级目录 ID，不传则检查根目录'
  }),
  fileNames: z.array(z.string()).min(1).meta({
    description: '待检查的文件名列表'
  })
});
export type CheckDuplicateFileNamesBody = z.infer<typeof CheckDuplicateFileNamesBodySchema>;

export const CheckDuplicateFileNamesResponseSchema = z.object({
  duplicateFileNames: z.array(z.string()).meta({
    description: '重复的文件名列表'
  })
});
export type CheckDuplicateFileNamesResponse = z.infer<typeof CheckDuplicateFileNamesResponseSchema>;

/* ============================================================================
 * API: 检查文件 MD5 重复
 * Route: POST /api/core/dataset/collection/check/md5Duplicate
 * ============================================================================ */
export const CheckMd5DuplicateBodySchema = z.object({
  datasetId: ObjectIdSchema.meta({
    example: '68ad85a7463006c963799a05',
    description: '知识库 ID'
  }),
  md5Map: z.record(z.string(), z.string()).meta({
    description: '文件名到 MD5 的映射，key 为文件名，value 为 MD5 值',
    example: { '文件1.pdf': 'd41d8cd98f00b204e9800998ecf8427e' }
  })
});
export type CheckMd5DuplicateBody = z.infer<typeof CheckMd5DuplicateBodySchema>;

export const Md5DuplicateItemSchema = z.object({
  md5: z
    .string()
    .regex(/^[a-fA-F0-9]{32}$/, '无效的 MD5 值')
    .meta({
      example: 'd41d8cd98f00b204e9800998ecf8427e',
      description: '重复的 MD5 值（32 位十六进制字符串）'
    }),
  type: z.enum(['batch', 'dataset']).meta({
    description: '重复类型：batch=同批次内重复，dataset=与知识库已有文件重复'
  }),
  existingFileName: z.string().meta({
    description: '已存在的文件名（同批次内第一个出现的 或 知识库中已有的）'
  }),
  newFileName: z.string().meta({
    description: '新文件名（当前检查的文件）'
  })
});
export type Md5DuplicateItem = z.infer<typeof Md5DuplicateItemSchema>;

export const CheckMd5DuplicateResponseSchema = z.object({
  duplicates: z.array(Md5DuplicateItemSchema).meta({
    description: '重复的文件列表'
  })
});
export type CheckMd5DuplicateResponse = z.infer<typeof CheckMd5DuplicateResponseSchema>;
