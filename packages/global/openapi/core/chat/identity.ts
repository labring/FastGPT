import z from 'zod';
import type { ZodOpenApiMetadata } from 'zod-openapi';
import { optionalNullToUndefined } from '../../../common/zod';
import { ChatAuthProxySchema, ChatAuthProxyQuerySchema } from '../../../support/permission/chat';

/**
 * Body 和 Query 共用三种互斥身份。Query 只将 authProxy 改为 JSON 字符串，解析后业务层仍接收对象。
 * completion 保留空串/null 的历史入参语义；管理接口只有省略字段才代表默认身份。
 */
export const createChatApiIdentitySchema = ({
  query = false,
  completion = false
}: { query?: boolean; completion?: boolean } = {}) => {
  const absent = completion ? optionalNullToUndefined(z.never()) : z.never().optional();
  const customUid = z
    .string()
    .min(completion ? 0 : 1)
    .max(1024)
    .meta({
      example: 'customer-42',
      description: '外部使用者 ID，与 authProxy 互斥；不改变鉴权成员'
    });
  const authProxy = query ? ChatAuthProxyQuerySchema : ChatAuthProxySchema;
  return z.union([
    z.object({ customUid: absent, authProxy: absent }).meta({
      title: '默认身份',
      description:
        '不传 customUid 和 authProxy，沿用凭证对应的团队成员身份。适用于直接以当前鉴权成员调用应用。'
    }),
    z.object({ customUid, authProxy: absent }).meta({
      title: '自定义使用者',
      description:
        '通过 customUid 对接自己平台的使用者，不改变鉴权成员及权限。发起对话时作为使用者和工作流 userId；管理对话时按该值限制使用者范围。'
    }),
    z.object({ customUid: absent, authProxy }).meta({
      title: '代理团队成员',
      description:
        '通过 authProxy 代表同团队成员执行，解析出有效 tmbId 后按该成员权限校验。仅开启代理权限的个人密钥可用，与 customUid 互斥。'
    })
  ]);
};

/**
 * 在现有资源、分页和业务参数外复用身份 union，保持 HTTP 字段平铺。
 * 文档每个身份选项携带完整请求字段，兼容 Scalar 对组合节点同级 properties 的展示限制。
 * showProxy 只控制文档：省略 appId 的旧 SDK 请求仍可使用个人代理 Key，实际凭证限制由服务端判断。
 * requiredIdentityFields 在显式使用者身份下条件必填，运行时与 OpenAPI 共用，防止缺少上下文时降级。
 */
export const withChatApiIdentity = <T extends z.ZodType>(
  schema: T,
  {
    query = false,
    completion = false,
    showProxy = true,
    hideFields = [],
    requiredIdentityFields = []
  }: {
    query?: boolean;
    completion?: boolean;
    showProxy?: boolean;
    hideFields?: string[];
    requiredIdentityFields?: string[];
  } = {}
) => {
  const identity = createChatApiIdentitySchema({ query, completion });
  return z
    .intersection(schema, identity)
    .superRefine((data, ctx) => {
      if (typeof data !== 'object' || data === null) return;
      if (
        Reflect.get(data, 'customUid') === undefined &&
        Reflect.get(data, 'authProxy') === undefined
      )
        return;

      // 显式使用者身份不能在缺少会话上下文时降级为直接资源访问。
      for (const key of requiredIdentityFields) {
        if (Reflect.get(data, key) === undefined) {
          ctx.addIssue({ code: 'custom', path: [key], message: '使用者身份必须提供会话上下文' });
        }
      }
    })
    .meta({
      ...schema.meta(),
      override: ({ jsonSchema }) => {
        const base = jsonSchema.allOf?.[0] ?? {};
        // 分页 schema 是 object + pagination union 的交集；提取共享对象，保留分页选项。
        const parts = base.allOf ?? [base];
        const objectParts = parts.filter((part) => part.properties);
        const others = parts.filter((part) => !part.properties);
        const common = {
          ...base,
          description: '',
          properties: Object.assign({}, ...objectParts.map((part) => part.properties)),
          required: [...new Set(objectParts.flatMap((part) => part.required ?? []))]
        };
        if (base.allOf) {
          if (others.length) common.allOf = others;
          else delete common.allOf;
        }
        const properties = { ...common.properties };
        const required = common.required ?? [];
        for (const field of ['customUid', 'authProxy', ...hideFields]) delete properties[field];
        delete jsonSchema.allOf;
        const options = identity.options;
        const pagination = others.length === 1 ? others[0].anyOf : undefined;
        jsonSchema.anyOf = options.slice(0, showProxy ? 3 : 2).map((option, index) => {
          const field = index === 1 ? 'customUid' : index === 2 ? 'authProxy' : undefined;
          const contextRequired = field ? requiredIdentityFields : [];
          // 隐藏的身份字段仍须保留互斥约束，避免缺参请求匹配默认身份分支。
          // completion 的 null 等同省略，只有非 null 的禁用身份字段才排除该分支。
          const identityConstraint =
            requiredIdentityFields.length > 0
              ? {
                  not: {
                    anyOf: ['customUid', 'authProxy']
                      .filter((key) => key !== field)
                      .map((key) => ({
                        required: [key],
                        ...(completion
                          ? { properties: { [key]: { not: { type: 'null' as const } } } }
                          : {})
                      }))
                  }
                }
              : {};
          // 业务 schema 保留更具体的字段说明；Query 则使用字符串协议的文档。
          const fieldSchema = field ? common.properties?.[field] : undefined;
          const identityProperties =
            field && fieldSchema
              ? {
                  [field]:
                    typeof fieldSchema === 'object'
                      ? {
                          // 保留原 Schema 的引用；Scalar 的单项 allOf 能保留组合字段的扩展标记。
                          allOf: [fieldSchema],
                          'x-fastgpt-union-parameter': true
                        }
                      : fieldSchema
                }
              : {};

          if (pagination) {
            // 身份参数先独立展示；分页的差异字段紧跟分页选择器，公共资源及筛选字段放在其后。
            const sharedFields = new Set(
              Object.keys(pagination[0]?.properties ?? {}).filter((key) =>
                pagination.every((page) => key in (page.properties ?? {}))
              )
            );
            const pages = pagination.map((page) => ({
              ...page,
              // 阻止 Scalar 将身份说明继承到分页选项，分页只展示自己的说明。
              description: page.description ?? '',
              properties: {
                ...Object.fromEntries(
                  Object.entries(page.properties ?? {}).filter(([key]) => !sharedFields.has(key))
                ),
                ...properties,
                ...Object.fromEntries(
                  Object.entries(page.properties ?? {}).filter(([key]) => sharedFields.has(key))
                )
              },
              required: [...new Set([...required, ...(page.required ?? [])])].filter(
                (key) => !hideFields.includes(key) && key !== 'customUid' && key !== 'authProxy'
              )
            }));
            return {
              ...identityConstraint,
              title: option.meta()?.title,
              description: option.meta()?.description ?? '',
              ...(field && fieldSchema
                ? {
                    properties: identityProperties,
                    required: [field, ...contextRequired],
                    // 保持身份字段为独立对象分段；空约束阻止 Scalar 折叠单项 allOf 后合并到分页。
                    // 分段不再互相合并，authProxy 的卡片标记和对象类型也能保留。
                    allOf: [{ anyOf: pages }, {}]
                  }
                : { anyOf: pages })
            };
          }

          return {
            ...common,
            ...identityConstraint,
            title: option.meta()?.title,
            description: option.meta()?.description ?? '',
            properties: {
              ...identityProperties,
              ...properties
            },
            required: [
              ...required.filter((key) => !hideFields.includes(key)),
              ...(field ? [field, ...contextRequired] : [])
            ]
          };
        });
      }
    } satisfies ZodOpenApiMetadata);
};
