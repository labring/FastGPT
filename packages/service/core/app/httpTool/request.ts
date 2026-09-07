import { str2OpenApiSchema } from '@fastgpt/global/core/app/jsonschema';

/**
 * 根据已保存的 OpenAPI 定义分配 HTTP 参数，不依赖工作流快照或手动 Body 模板。
 * 复用禁用外部引用的解析器；只处理导入器支持的 JSON 对象 Body，保留嵌套值的原始类型。
 * 返回编码后的路径，调用方必须在编码完成后检查最终 URL 的 SSRF 边界。
 */
export const buildOpenAPIHttpRequest = async ({
  apiSchemaStr,
  toolPath,
  method,
  params
}: {
  apiSchemaStr: string;
  toolPath: string;
  method: string;
  params: Record<string, unknown>;
}) => {
  const { pathData } = await str2OpenApiSchema(apiSchemaStr);
  const operation = pathData.find(
    (item) => item.path === toolPath && item.method.toUpperCase() === method.toUpperCase()
  );
  if (!operation) throw new Error(`OpenAPI operation not found: ${method} ${toolPath}`);

  const queryEntries: [string, unknown][] = [];
  const headerEntries: [string, string][] = [];
  const nonBodyNames = new Set<string>();
  const pathValues = new Map<string, string>();

  for (const parameter of operation.params ?? []) {
    if (parameter.in === 'body') continue; // Swagger 2 的 body 已由解析器转为 request.content。
    if (!['query', 'header', 'path'].includes(parameter.in)) {
      throw new Error(`Unsupported OpenAPI parameter location: ${parameter.in}`);
    }
    const name = parameter.name;
    if (typeof name !== 'string') continue;
    nonBodyNames.add(name);
    const value = Object.hasOwn(params, name) ? params[name] : undefined;
    if (value === undefined) {
      if (parameter.required || parameter.in === 'path') {
        throw new Error(`Missing OpenAPI ${parameter.in} parameter: ${name}`);
      }
      continue;
    }

    if (parameter.in === 'query') queryEntries.push([name, value]);
    if (parameter.in === 'header') {
      headerEntries.push([name, Array.isArray(value) ? value.join(',') : String(value)]);
    }
    if (parameter.in === 'path') {
      if (value === '.' || value === '..')
        throw new Error(`Invalid OpenAPI path parameter: ${name}`);
      pathValues.set(name, encodeURIComponent(String(value)));
    }
  }

  const resolvedPath = toolPath.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const value = pathValues.get(name);
    if (value === undefined) throw new Error(`Missing OpenAPI path parameter: ${name}`);
    return value;
  });
  const bodySchema = operation.request?.content?.['application/json']?.schema;
  const body = (() => {
    if (!bodySchema) {
      if (operation.request)
        throw new Error('Only application/json OpenAPI request bodies are supported');
      return undefined;
    }
    if (bodySchema.type && bodySchema.type !== 'object') {
      throw new Error('OpenAPI request body must be an object');
    }
    const properties = bodySchema.properties ?? {};
    const required: string[] = bodySchema.required ?? [];
    for (const name of required) {
      if (!Object.hasOwn(params, name) || params[name] === undefined) {
        throw new Error(`Missing OpenAPI body parameter: ${name}`);
      }
    }
    return Object.fromEntries(
      Object.entries(params).filter(
        ([name, value]) =>
          value !== undefined &&
          (Object.hasOwn(properties, name) ||
            (!nonBodyNames.has(name) && bodySchema.additionalProperties !== false))
      )
    );
  })();

  return {
    toolPath: resolvedPath,
    body,
    queryParams: queryEntries.length ? Object.fromEntries(queryEntries) : undefined,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...Object.fromEntries(headerEntries)
    }
  };
};
