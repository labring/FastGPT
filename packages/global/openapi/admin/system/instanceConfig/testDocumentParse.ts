import z from 'zod';
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';

/* ============================================================================
 * API: 测试文档增强解析服务
 * Route: POST /api/admin/system/config/testDocumentParse
 * Method: POST
 * Description: 使用内置单页测试 PDF 调用指定文档增强解析服务，验证地址、凭据与解析返回协议是否可用
 * Tags: ['Admin', 'InstanceConfig', 'DocumentParse']
 * ============================================================================ */

export const TestDocumentParseProviderSchema = z
  .enum(['somark', 'doc2x', 'textin', 'textln', 'customPdf', 'custom', 'sangfor'])
  .meta({
    description: '待测试的文档增强解析服务提供方',
    example: 'somark'
  });
export type TestDocumentParseProvider = z.infer<typeof TestDocumentParseProviderSchema>;

export const TestDocumentParseBodySchema = z.object({
  provider: TestDocumentParseProviderSchema,
  url: z.string().optional().meta({
    description: '自建或深信服解析服务地址',
    example: 'https://pdf-parser.example.com/v2/parse/file'
  }),
  key: z.string().optional().meta({
    description: '自建或深信服认证密钥；省略时自动使用服务端已保存密钥，空字符串表示不使用密钥',
    example: 'sk-custom-key'
  }),
  somarkBaseUrl: z.string().optional().meta({
    description: 'SoMark 服务基础地址；空值回退国际站 https://somark.ai/api/v1',
    example: 'https://somark.ai/api/v1'
  }),
  somarkApiKey: z.string().optional().meta({
    description: 'SoMark API Key；省略时自动使用服务端已保存密钥',
    example: 'sk-somark-xxx'
  }),
  doc2xKey: z.string().optional().meta({
    description: 'Doc2X API Key；省略时自动使用服务端已保存密钥',
    example: 'sk-doc2x-xxx'
  }),
  textinAppId: z.string().optional().meta({
    description: 'TextIn AppId；省略时自动使用服务端已保存密钥',
    example: 'textin-app-id'
  }),
  textinSecretCode: z.string().optional().meta({
    description: 'TextIn Secret Code；省略时自动使用服务端已保存密钥',
    example: 'textin-secret-code'
  })
});
export type TestDocumentParseBody = z.infer<typeof TestDocumentParseBodySchema>;

export const TestDocumentParseResponseSchema = z.object({
  success: z.boolean().meta({
    description: '是否成功完成测试 PDF 解析',
    example: true
  }),
  responseTimeMs: z.number().nonnegative().meta({
    description: '测试解析耗时（毫秒）',
    example: 1280
  }),
  pages: z.number().int().nonnegative().optional().meta({
    description: '解析服务返回的测试文档页数',
    example: 1
  }),
  error: z.string().optional().meta({
    description: '解析失败时的错误说明',
    example: '[SoMark] Invalid API key.'
  })
});
export type TestDocumentParseResponse = z.infer<typeof TestDocumentParseResponseSchema>;

export const AdminInstanceConfigTestDocumentParsePath: OpenAPIPath = {
  '/api/admin/system/config/testDocumentParse': {
    post: {
      summary: '使用示例 PDF 测试文档增强解析服务',
      description:
        '仅超级管理员 root 可调用。构造最小单页测试 PDF 发送至当前草稿或已保存的解析服务（SoMark / Doc2X / TextIn / 自建服务 / 深信服），验证连通性、鉴权与解析返回协议，不写入对象存储且不计费',
      tags: [DevApiTagsMap.adminSettings],
      requestBody: {
        content: {
          'application/json': {
            schema: TestDocumentParseBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '测试执行完成',
          content: {
            'application/json': {
              schema: TestDocumentParseResponseSchema
            }
          }
        }
      }
    }
  }
};
