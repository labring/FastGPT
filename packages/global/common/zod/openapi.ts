import type { ZodOpenApiMetadata } from 'zod-openapi';

/**
 * 任意 JSON 值。运行时保持宽松（z.any()），文档里声明 JSON 的六种取值，
 * 避免客户端把工作流变量这类动态字段渲染成 null/any。
 */
export const JsonValueOpenApiMeta = {
  type: ['object', 'array', 'string', 'number', 'boolean', 'null']
} satisfies Pick<ZodOpenApiMetadata, 'type'>;

/**
 * 结构随渠道/插件/模板类型变化、但一定是对象：运行时保持宽松，文档里声明为开放对象，
 * 避免客户端拿到 null/any。
 */
export const OpenObjectOpenApiMeta = {
  type: 'object',
  additionalProperties: true
} satisfies Pick<ZodOpenApiMetadata, 'type' | 'additionalProperties'>;

/** 显式导出 refine 中的字段组合约束；顺序也是文档默认示例的选择顺序，不改变运行时校验。 */
export const requiredAlternatives = (
  branches: string[][],
  exclusive = false
): Pick<ZodOpenApiMetadata, 'override'> => ({
  override: ({ jsonSchema }) => {
    const choices = branches.map((required) => ({ required }));
    if (exclusive) jsonSchema.oneOf = choices;
    else jsonSchema.anyOf = choices;
  }
});
