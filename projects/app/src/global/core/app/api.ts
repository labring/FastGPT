import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import type {
  PublishAppBodySchema,
  PublishAppBodyType
} from '@fastgpt/global/openapi/core/app/version/api';
import type { z } from 'zod';

type PublishAppBody = z.output<typeof PublishAppBodySchema>;

/** 编辑器每次保存都会提交完整工作流，选项使用 API 解析后的类型。 */
export type PostPublishAppProps = Omit<PublishAppBody, 'nodes' | 'edges' | 'chatConfig'> &
  Required<Pick<PublishAppBody, 'edges' | 'chatConfig'>> &
  Required<Pick<PublishAppBodyType, 'nodes'>>;

export type PostRevertAppProps = {
  versionId: string;
  // edit workflow
  editNodes: AppVersionSchemaType['nodes'];
  editEdges: AppVersionSchemaType['edges'];
  editChatConfig: AppVersionSchemaType['chatConfig'];
};
