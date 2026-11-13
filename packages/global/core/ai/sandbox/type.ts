import z from 'zod';
import { IntSchema } from '../../../common/zod';
import { SandboxUnavailableReasonEnum } from './constants';

export const SandboxUnavailableReasonSchema = z.enum(SandboxUnavailableReasonEnum);

/**
 * 沙盒命令执行结果。
 */
export const ExecuteResultSchema = z.object({
  stdout: z.string().meta({ example: 'ok\n', description: '命令标准输出' }),
  stderr: z.string().meta({ example: '', description: '命令标准错误输出' }),
  exitCode: z.number().int().nullable().meta({
    example: 0,
    description: '命令退出码；无法解析时为 null'
  }),
  truncated: z.boolean().optional().meta({
    example: false,
    description: '输出是否因超出字节上限被截断'
  }),
  durationMs: z.number().optional().meta({
    example: 42,
    description: '命令执行耗时（毫秒）'
  })
});
export type ExecuteResult = z.infer<typeof ExecuteResultSchema>;

/**
 * 沙盒会话目录下的单层目录项结构。
 */
export const SandboxSessionDirEntrySchema = z.object({
  name: z.string().meta({ example: 'main.py', description: '文件或目录名称' }),
  path: z.string().meta({
    example: 'src/main.py',
    description: '相对于当前会话工作目录的路径'
  }),
  type: z.enum(['file', 'directory']).meta({ example: 'file', description: '目录项类型' }),
  size: IntSchema.nonnegative().optional().meta({ example: 1024, description: '文件字节大小' }),
  mtime: z.number().optional().meta({
    example: 1735689600000,
    description: '最后修改时间（毫秒时间戳）'
  })
});
export type SandboxSessionDirEntry = z.infer<typeof SandboxSessionDirEntrySchema>;
