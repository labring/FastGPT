import type { ZodOpenApiMetadata } from 'zod-openapi';

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
