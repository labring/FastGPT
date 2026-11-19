import type { IrProperty, IrSchema } from './irTypes';

export type RawJsonSchema = Record<string, unknown>;

type NormalizeContext = {
  rootDoc: Record<string, unknown>;
  mode: 'requestTop' | 'requestNested' | 'response';
  activeRefs: Set<string>;
};

const NON_SDK_BRANCH_TITLE_PATTERN =
  /Skill\s*调试会话|外链会话|分享链接会话|兼容\s*sourceType\/sourceId|旧版\s*query\.id\s*兼容/;

const FORBIDDEN_REQUEST_PROPERTIES = new Set<string>([
  'skillId',
  'shareId',
  'outLinkUid',
  'outLinkAuthData'
]);

const isRecord = (value: unknown): value is RawJsonSchema =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * 解析文档内部 JSON Pointer 引用（#/components/...），通过 activeRefs 阻断自递归死循环。
 */
const resolveRef = (schema: RawJsonSchema, ctx: NormalizeContext): RawJsonSchema | null => {
  const ref = schema.$ref;
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return schema;
  }
  if (ctx.activeRefs.has(ref)) {
    return null;
  }

  const target = ref
    .slice(2)
    .split('/')
    .reduce<unknown>((cur, seg) => {
      const key = seg.replace(/~1/g, '/').replace(/~0/g, '~');
      return isRecord(cur) ? cur[key] : undefined;
    }, ctx.rootDoc);

  if (!isRecord(target)) {
    return null;
  }

  const { $ref: _ignored, ...siblings } = schema;
  return Object.keys(siblings).length > 0 ? { ...target, ...siblings } : target;
};

/**
 * 判断某个 Schema 是否等价于 Zod never / undefined（禁止传入或无返回值守卫）。
 */
export const isNeverJsonSchema = (schema: unknown): boolean => {
  if (schema === false) return true;
  if (!isRecord(schema)) return false;
  if (Array.isArray(schema.enum) && schema.enum.length === 0) return true;
  if (isRecord(schema.not) && Object.keys(schema.not).length === 0) return true;
  return false;
};

/**
 * 判断联合分支是否属于仅供站内调试、分享外链或已废弃兼容使用的非 SDK 分支。
 */
const isNonSdkRequestBranch = (branch: RawJsonSchema): boolean => {
  if (typeof branch.title === 'string' && NON_SDK_BRANCH_TITLE_PATTERN.test(branch.title)) {
    return true;
  }

  if (Array.isArray(branch.required)) {
    for (const reqKey of branch.required) {
      if (typeof reqKey === 'string' && FORBIDDEN_REQUEST_PROPERTIES.has(reqKey)) {
        return true;
      }
    }
  }

  const props = isRecord(branch.properties) ? branch.properties : undefined;
  const sourceTypeProp = props !== undefined ? props.sourceType : undefined;
  if (isRecord(sourceTypeProp) && typeof sourceTypeProp.const === 'string') {
    if (sourceTypeProp.const !== 'app') {
      return true;
    }
  }

  return false;
};

/**
 * 判断请求对象中的单个字段是否属于非开放内部字段。
 *
 * sourceType 仅当取值为会话辅助生成枚举（app / chatAgentHelper / workflowBuilder）时剥离，
 * 避免误伤其他业务模块中合法的同名业务字段。
 */
export const shouldStripRequestProperty = (name: string, rawProp: unknown): boolean => {
  if (isNeverJsonSchema(rawProp)) return true;
  if (FORBIDDEN_REQUEST_PROPERTIES.has(name)) return true;

  if (name === 'sourceType' && isRecord(rawProp)) {
    if (rawProp.const === 'app') return true;
    if (
      Array.isArray(rawProp.enum) &&
      rawProp.enum.some((val) => val === 'chatAgentHelper' || val === 'workflowBuilder')
    ) {
      return true;
    }
  }

  return false;
};

/**
 * 计算 IrSchema 的结构签名（忽略描述文案），用于在合并联合分支时精确去重同构类型。
 */
export const getIrSchemaSignature = (schema: IrSchema): string => {
  switch (schema.kind) {
    case 'primitive':
      return `prim:${schema.type}`;
    case 'literal':
      return `lit:${typeof schema.value}:${String(schema.value)}`;
    case 'enum':
      return `enum:${JSON.stringify([...schema.values].sort())}`;
    case 'binary':
      return `bin:${schema.multiple === true ? 'multi' : 'single'}`;
    case 'unknown':
      return 'unknown';
    case 'array':
      return `arr:${getIrSchemaSignature(schema.items)}`;
    case 'tuple':
      return `tup:[${schema.items.map(getIrSchemaSignature).join(',')}]`;
    case 'record':
      return `rec:${getIrSchemaSignature(schema.valueType)}`;
    case 'union':
      return `uni:(${schema.variants.map(getIrSchemaSignature).sort().join('|')})`;
    case 'object': {
      const propsSig = [...schema.properties]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => `${p.name}${p.required ? '!' : '?'}:${getIrSchemaSignature(p.schema)}`)
        .join(',');
      const extraSig =
        schema.additionalProperties === undefined || schema.additionalProperties === false
          ? ''
          : schema.additionalProperties === true
            ? '+any'
            : `+${getIrSchemaSignature(schema.additionalProperties)}`;
      return `obj:{${propsSig}${extraSig}}`;
    }
  }
};

/**
 * 合并并去重多个 IrSchema 分支；单一分支直接退化为原类型。
 */
export const mergeIrUnionVariants = (variants: IrSchema[], description?: string): IrSchema => {
  const flat: IrSchema[] = [];
  for (const variant of variants) {
    if (variant.kind === 'union') {
      flat.push(...variant.variants);
    } else {
      flat.push(variant);
    }
  }

  // 若分支中已包含 unknown，整个值域即为 unknown。
  if (flat.some((item) => item.kind === 'unknown')) {
    return { kind: 'unknown', ...(description !== undefined ? { description } : {}) };
  }

  const deduped = new Map<string, IrSchema>();
  for (const item of flat) {
    const sig = getIrSchemaSignature(item);
    if (!deduped.has(sig)) {
      deduped.set(sig, item);
    }
  }

  const unique = [...deduped.values()];
  if (unique.length === 0) {
    return { kind: 'unknown', ...(description !== undefined ? { description } : {}) };
  }
  if (unique.length === 1) {
    const single = unique[0]!;
    return description !== undefined && single.description === undefined
      ? { ...single, description }
      : single;
  }

  return {
    kind: 'union',
    variants: unique,
    ...(description !== undefined ? { description } : {})
  };
};

/**
 * 将多个已归一化的对象 Schema 按指定布尔语义合并为单个扁平对象：
 * - mode = 'or'（对应 anyOf / oneOf）：字段取并集，required 取非空分支的交集；
 * - mode = 'and'（对应 allOf）：字段取并集，required 取并集。
 */
export const mergeIrObjectSchemas = ({
  objects,
  mode,
  description
}: {
  objects: Array<Extract<IrSchema, { kind: 'object' }>>;
  mode: 'or' | 'and';
  description?: string;
}): Extract<IrSchema, { kind: 'object' }> => {
  if (objects.length === 0) {
    return {
      kind: 'object',
      properties: [],
      ...(description !== undefined ? { description } : {})
    };
  }
  if (objects.length === 1) {
    const only = objects[0]!;
    return description !== undefined && only.description === undefined
      ? { ...only, description }
      : only;
  }

  const propOrder: string[] = [];
  const propSchemas = new Map<string, IrSchema[]>();
  const propDescriptions = new Map<string, string>();
  const propDeprecated = new Map<string, boolean>();
  const branchRequiredSets: Array<Set<string>> = [];
  let hasTrueAdditional = false;
  const schemaAdditionals: IrSchema[] = [];

  for (const obj of objects) {
    const reqSet = new Set<string>();
    for (const prop of obj.properties) {
      if (!propSchemas.has(prop.name)) {
        propOrder.push(prop.name);
        propSchemas.set(prop.name, []);
      }
      propSchemas.get(prop.name)!.push(prop.schema);
      if (prop.description !== undefined && !propDescriptions.has(prop.name)) {
        propDescriptions.set(prop.name, prop.description);
      }
      const prevDep = propDeprecated.get(prop.name);
      propDeprecated.set(
        prop.name,
        prevDep === undefined ? prop.deprecated === true : prevDep && prop.deprecated === true
      );
      if (prop.required) {
        reqSet.add(prop.name);
      }
    }
    branchRequiredSets.push(reqSet);

    if (obj.additionalProperties === true) {
      hasTrueAdditional = true;
    } else if (isRecord(obj.additionalProperties)) {
      schemaAdditionals.push(obj.additionalProperties as IrSchema);
    }
  }

  const properties: IrProperty[] = propOrder.map((name) => {
    const schemas = propSchemas.get(name) ?? [];
    const required = (() => {
      if (mode === 'and') {
        return branchRequiredSets.some((set) => set.has(name));
      }
      // OR 模式：仅当所有分支都要求该字段必填时，合并后的扁平结构才标记为必填。
      return branchRequiredSets.length > 0 && branchRequiredSets.every((set) => set.has(name));
    })();

    const mergedSchema = mergeIrUnionVariants(schemas);
    const desc = propDescriptions.get(name) ?? mergedSchema.description;
    const dep = propDeprecated.get(name) === true;

    return {
      name,
      schema: mergedSchema,
      required,
      ...(desc !== undefined ? { description: desc } : {}),
      ...(dep ? { deprecated: true } : {})
    };
  });

  const additionalProperties = (() => {
    if (hasTrueAdditional) return true;
    if (schemaAdditionals.length > 0) return mergeIrUnionVariants(schemaAdditionals);
    return undefined;
  })();

  return {
    kind: 'object',
    properties,
    ...(additionalProperties !== undefined ? { additionalProperties } : {}),
    ...(description !== undefined ? { description } : {})
  };
};

/**
 * 将任意 OpenAPI 3.1 JSON Schema 节点转换为规范化 IrSchema。
 */
export const normalizeJsonSchemaToIr = ({
  rawSchema,
  rootDoc,
  mode
}: {
  rawSchema: unknown;
  rootDoc: Record<string, unknown>;
  mode: 'requestTop' | 'requestNested' | 'response';
}): IrSchema => {
  const convert = (input: unknown, ctx: NormalizeContext): IrSchema => {
    if (input === true || input === undefined || input === null) {
      return { kind: 'unknown' };
    }
    if (!isRecord(input)) {
      return { kind: 'unknown' };
    }

    const refKey = typeof input.$ref === 'string' ? input.$ref : undefined;
    const resolved = resolveRef(input, ctx);
    if (resolved === null) {
      return { kind: 'unknown' };
    }

    const nextCtx: NormalizeContext =
      refKey !== undefined
        ? {
            ...ctx,
            activeRefs: new Set(ctx.activeRefs).add(refKey)
          }
        : ctx;

    const description = typeof resolved.description === 'string' ? resolved.description : undefined;
    const deprecated = resolved.deprecated === true;
    const metaPatch = {
      ...(description !== undefined ? { description } : {}),
      ...(deprecated ? { deprecated: true } : {})
    };

    // 1. 处理二进制上传/下载字段（format: binary）
    if (resolved.format === 'binary') {
      return {
        kind: 'binary',
        ...(description !== undefined ? { description } : {})
      };
    }

    // 2. 处理字面量常量（const）与枚举（enum）
    if (
      typeof resolved.const === 'string' ||
      typeof resolved.const === 'number' ||
      typeof resolved.const === 'boolean'
    ) {
      return { kind: 'literal', value: resolved.const, ...metaPatch };
    }

    if (Array.isArray(resolved.enum)) {
      const validValues = resolved.enum.filter(
        (v): v is string | number | boolean =>
          typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
      );
      if (validValues.length === 1) {
        return { kind: 'literal', value: validValues[0]!, ...metaPatch };
      }
      if (validValues.length > 1) {
        return { kind: 'enum', values: validValues, ...metaPatch };
      }
    }

    // 3. 处理 allOf 交集（提取额外 required 约束、忽略纯 not 守卫断言，再合并各对象成员）
    if (Array.isArray(resolved.allOf) && resolved.allOf.length > 0) {
      const { allOf, ...ownRest } = resolved;
      const extraRequired = new Set<string>(
        Array.isArray(ownRest.required)
          ? ownRest.required.filter((k): k is string => typeof k === 'string')
          : []
      );

      const rawMembers: unknown[] = [...allOf];
      if (
        isRecord(ownRest.properties) ||
        Array.isArray(ownRest.anyOf) ||
        Array.isArray(ownRest.oneOf)
      ) {
        rawMembers.push(ownRest);
      }

      const parts: IrSchema[] = [];
      for (const item of rawMembers) {
        if (isRecord(item)) {
          if (Array.isArray(item.required)) {
            for (const reqKey of item.required) {
              if (typeof reqKey === 'string' && !FORBIDDEN_REQUEST_PROPERTIES.has(reqKey)) {
                extraRequired.add(reqKey);
              }
            }
          }
          const hasStructuralShape =
            item.$ref !== undefined ||
            item.type !== undefined ||
            item.properties !== undefined ||
            item.additionalProperties !== undefined ||
            item.items !== undefined ||
            item.prefixItems !== undefined ||
            item.const !== undefined ||
            item.enum !== undefined ||
            item.anyOf !== undefined ||
            item.oneOf !== undefined ||
            item.allOf !== undefined;
          if (!hasStructuralShape) {
            continue;
          }
        }
        parts.push(convert(item, nextCtx));
      }

      const nonUnknownParts = parts.filter((part) => part.kind !== 'unknown');
      const objectParts: Array<Extract<IrSchema, { kind: 'object' }>> = [];
      const objectUnionParts: Array<Extract<IrSchema, { kind: 'union' }>> = [];
      const otherParts: IrSchema[] = [];

      for (const part of nonUnknownParts) {
        if (part.kind === 'object') {
          objectParts.push(part);
        } else if (part.kind === 'union' && part.variants.every((v) => v.kind === 'object')) {
          objectUnionParts.push(part);
        } else {
          otherParts.push(part);
        }
      }

      if (otherParts.length === 0 && (objectParts.length > 0 || objectUnionParts.length > 0)) {
        let candidates: Array<Extract<IrSchema, { kind: 'object' }>> =
          objectParts.length > 0
            ? [mergeIrObjectSchemas({ objects: objectParts, mode: 'and' })]
            : [{ kind: 'object', properties: [] }];

        // 按交集对并集的分配律展开：A & (B1 | B2) => (A & B1) | (A & B2)
        for (const unionPart of objectUnionParts) {
          const branchObjects = unionPart.variants as Array<Extract<IrSchema, { kind: 'object' }>>;
          candidates = candidates.flatMap((baseObj) =>
            branchObjects.map((branchObj) =>
              mergeIrObjectSchemas({
                objects: [baseObj, branchObj],
                mode: 'and'
              })
            )
          );
        }

        if (extraRequired.size > 0) {
          candidates = candidates.map((cand) => ({
            ...cand,
            properties: cand.properties.map((p) =>
              extraRequired.has(p.name) ? { ...p, required: true } : p
            )
          }));
        }

        if (nextCtx.mode === 'requestTop') {
          return mergeIrObjectSchemas({
            objects: candidates,
            mode: 'or',
            description
          });
        }

        if (candidates.length === 1) {
          const singleObj = candidates[0]!;
          return description !== undefined && singleObj.description === undefined
            ? { ...singleObj, description }
            : singleObj;
        }

        return mergeIrUnionVariants(candidates, description);
      }

      if (nonUnknownParts.length === 1) {
        const inner = nonUnknownParts[0]!;
        return description !== undefined && inner.description === undefined
          ? { ...inner, description }
          : inner;
      }

      return mergeIrUnionVariants(
        nonUnknownParts.length > 0 ? nonUnknownParts : parts,
        description
      );
    }

    // 4. 处理 anyOf / oneOf 联合
    const rawBranches = Array.isArray(resolved.anyOf)
      ? resolved.anyOf
      : Array.isArray(resolved.oneOf)
        ? resolved.oneOf
        : null;

    if (rawBranches !== null && rawBranches.length > 0) {
      const isRequest = nextCtx.mode === 'requestTop' || nextCtx.mode === 'requestNested';
      const filteredBranches = rawBranches.filter((branch) => {
        if (isNeverJsonSchema(branch)) return false;
        if (isRequest && isRecord(branch) && isNonSdkRequestBranch(branch)) return false;
        return true;
      });

      // 若顶层对象自身带有公共 properties，下沉与各分支做交集后再合并。
      const { anyOf: _a, oneOf: _o, ...sharedBase } = resolved;
      const hasSharedProps =
        isRecord(sharedBase.properties) && Object.keys(sharedBase.properties).length > 0;

      const convertedBranches = filteredBranches.map((branch) => {
        if (hasSharedProps && isRecord(branch)) {
          return convert({ allOf: [sharedBase, branch] }, nextCtx);
        }
        return convert(branch, nextCtx);
      });

      // 请求顶层对象联合统一拍平为单个结构体，彻底消除跨语言 OneOf 包装类。
      if (
        nextCtx.mode === 'requestTop' &&
        convertedBranches.length > 0 &&
        convertedBranches.every((b) => b.kind === 'object')
      ) {
        return mergeIrObjectSchemas({
          objects: convertedBranches as Array<Extract<IrSchema, { kind: 'object' }>>,
          mode: 'or',
          description
        });
      }

      return mergeIrUnionVariants(convertedBranches, description);
    }

    // 5. 处理 OpenAPI 3.1 多类型数组（如 ['string', 'null'] 或 JsonValue 6 类型全集）
    if (Array.isArray(resolved.type)) {
      const types = resolved.type.filter((t): t is string => typeof t === 'string');
      if (types.includes('object') && types.includes('array') && types.includes('string')) {
        return { kind: 'unknown', ...metaPatch };
      }
      const variants: IrSchema[] = types.map((t) => {
        if (
          t === 'string' ||
          t === 'number' ||
          t === 'integer' ||
          t === 'boolean' ||
          t === 'null'
        ) {
          return { kind: 'primitive', type: t };
        }
        return { kind: 'unknown' };
      });
      return mergeIrUnionVariants(variants, description);
    }

    // 6. 处理元组（prefixItems）与数组（array）
    const nestedCtx: NormalizeContext =
      nextCtx.mode === 'requestTop' ? { ...nextCtx, mode: 'requestNested' } : nextCtx;

    if (Array.isArray(resolved.prefixItems) && resolved.prefixItems.length > 0) {
      return {
        kind: 'tuple',
        items: resolved.prefixItems.map((item) => convert(item, nestedCtx)),
        ...metaPatch
      };
    }

    if (resolved.type === 'array' || resolved.items !== undefined) {
      if (isRecord(resolved.items) && resolved.items.format === 'binary') {
        return {
          kind: 'binary',
          multiple: true,
          ...(description !== undefined ? { description } : {})
        };
      }
      const itemSchema =
        resolved.items !== undefined
          ? convert(resolved.items, nestedCtx)
          : ({ kind: 'unknown' } as const);
      return {
        kind: 'array',
        items: itemSchema,
        ...metaPatch
      };
    }

    // 7. 处理对象与开放字典（Record）
    const rawProps = isRecord(resolved.properties) ? resolved.properties : undefined;
    if (
      resolved.type === 'object' ||
      rawProps !== undefined ||
      resolved.additionalProperties !== undefined
    ) {
      const propEntries = Object.entries(rawProps ?? {}).filter(([propName, propVal]) => {
        if (nextCtx.mode === 'response') {
          return !isNeverJsonSchema(propVal);
        }
        return !shouldStripRequestProperty(propName, propVal);
      });

      if (
        propEntries.length === 0 &&
        resolved.additionalProperties !== undefined &&
        resolved.additionalProperties !== false
      ) {
        const valueType: IrSchema =
          resolved.additionalProperties === true
            ? { kind: 'unknown' }
            : convert(resolved.additionalProperties, nestedCtx);
        return {
          kind: 'record',
          valueType,
          ...metaPatch
        };
      }

      const requiredSet = new Set<string>(
        Array.isArray(resolved.required)
          ? resolved.required.filter((k): k is string => typeof k === 'string')
          : []
      );

      const properties: IrProperty[] = propEntries.map(([propName, propVal]) => {
        const propSchema = convert(propVal, nestedCtx);
        const propDesc =
          (isRecord(propVal) && typeof propVal.description === 'string'
            ? propVal.description
            : undefined) ?? propSchema.description;
        const propDep =
          (isRecord(propVal) && propVal.deprecated === true) || propSchema.deprecated === true;

        return {
          name: propName,
          schema: propSchema,
          required: requiredSet.has(propName),
          ...(propDesc !== undefined ? { description: propDesc } : {}),
          ...(propDep ? { deprecated: true } : {})
        };
      });

      const additionalProperties = (() => {
        if (resolved.additionalProperties === true) return true;
        if (isRecord(resolved.additionalProperties)) {
          const convertedExtra = convert(resolved.additionalProperties, nestedCtx);
          return convertedExtra;
        }
        return undefined;
      })();

      return {
        kind: 'object',
        properties,
        ...(additionalProperties !== undefined ? { additionalProperties } : {}),
        ...metaPatch
      };
    }

    // 8. 处理基础标量类型
    const scalarType = resolved.type;
    if (
      scalarType === 'string' ||
      scalarType === 'number' ||
      scalarType === 'integer' ||
      scalarType === 'boolean' ||
      scalarType === 'null'
    ) {
      return {
        kind: 'primitive',
        type: scalarType,
        ...(typeof resolved.format === 'string' ? { format: resolved.format } : {}),
        ...metaPatch
      };
    }

    return { kind: 'unknown', ...metaPatch };
  };

  return convert(rawSchema, {
    rootDoc,
    mode,
    activeRefs: new Set<string>()
  });
};

/**
 * 将请求顶层 Schema 强制收敛为 IrObject（若归一化后仍为对象联合则执行 OR 拍平）。
 */
export const normalizeRequestObjectToIr = ({
  rawSchema,
  rootDoc
}: {
  rawSchema: unknown;
  rootDoc: Record<string, unknown>;
}): Extract<IrSchema, { kind: 'object' }> => {
  const normalized = normalizeJsonSchemaToIr({
    rawSchema,
    rootDoc,
    mode: 'requestTop'
  });

  if (normalized.kind === 'object') {
    return normalized;
  }

  if (normalized.kind === 'union') {
    const objectVariants = normalized.variants.filter(
      (v): v is Extract<IrSchema, { kind: 'object' }> => v.kind === 'object'
    );
    if (objectVariants.length > 0) {
      return mergeIrObjectSchemas({
        objects: objectVariants,
        mode: 'or',
        description: normalized.description
      });
    }
  }

  return {
    kind: 'object',
    properties: []
  };
};
