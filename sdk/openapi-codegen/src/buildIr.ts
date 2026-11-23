import { apiDocOpenAPIDocument } from '@fastgpt/global/openapi/provider/systemopenapi';
import { FastGptSdkMetaSchema } from '@fastgpt/global/openapi/type';
import type {
  IrContextCarrier,
  IrHttpMethod,
  IrMultipartMode,
  IrOperation,
  IrProperty,
  IrRequestContentType,
  IrRequestObjectSchema,
  IrRequestSchema,
  IrResourceNode,
  IrResponseMode,
  IrSchema,
  SdkIrDocument
} from './irTypes';
import {
  isNeverJsonSchema,
  mergeIrObjectSchemas,
  normalizeJsonSchemaToIr,
  normalizeRequestObjectToIr,
  normalizeRequestSchemaToIr,
  shouldPreserveRequestObjectUnion,
  shouldStripRequestProperty,
  type RawJsonSchema
} from './schemaNormalizer';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;

const RAW_JSON_RESPONSE_PATHS = new Set<string>(['/v2/chat/completions']);

const isRecord = (value: unknown): value is RawJsonSchema =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const capitalize = (word: string): string =>
  word.length === 0 ? '' : `${word[0]!.toUpperCase()}${word.slice(1)}`;

/**
 * 根据点分资源路径与方法名生成确定性的大驼峰类型名前缀，例如：
 * ('datasets.collections', 'list') -> 'DatasetsCollectionsList'
 */
export const toOperationPascalPrefix = ({
  resource,
  method
}: {
  resource: string;
  method: string;
}): string => {
  const segments = [...resource.split('.'), method];
  return segments.map(capitalize).join('');
};

/**
 * 按点分路径将扁平操作列表组装为稳定的多级领域资源树。
 */
const buildResourceTree = (operations: IrOperation[]): IrResourceNode[] => {
  type MutableNode = {
    name: string;
    fullPath: string;
    operations: IrOperation[];
    childrenMap: Map<string, MutableNode>;
  };

  const rootMap = new Map<string, MutableNode>();

  for (const op of operations) {
    const segments = op.resource.split('.');
    let currentMap = rootMap;
    let currentNode: MutableNode | undefined;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const fullPath = segments.slice(0, i + 1).join('.');
      let node = currentMap.get(seg);
      if (node === undefined) {
        node = {
          name: seg,
          fullPath,
          operations: [],
          childrenMap: new Map()
        };
        currentMap.set(seg, node);
      }
      currentNode = node;
      currentMap = node.childrenMap;
    }

    currentNode?.operations.push(op);
  }

  const freezeNodes = (map: Map<string, MutableNode>): IrResourceNode[] =>
    [...map.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((node) => ({
        name: node.name,
        fullPath: node.fullPath,
        operations: [...node.operations].sort((a, b) => a.method.localeCompare(b.method)),
        children: freezeNodes(node.childrenMap)
      }));

  return freezeNodes(rootMap);
};

/**
 * 从治理后的 SystemOpenAPI 文档构建语言无关、100% 扁平化的 SDK 中间表示（SdkIrDocument）。
 */
export const buildSdkIrDocument = (): SdkIrDocument => {
  const rootDoc = apiDocOpenAPIDocument as unknown as Record<string, unknown>;
  const pathsObj = isRecord(rootDoc.paths) ? rootDoc.paths : {};
  const operations: IrOperation[] = [];

  for (const [routePath, rawPathItem] of Object.entries(pathsObj)) {
    if (!isRecord(rawPathItem)) continue;

    const pathLevelParams = Array.isArray(rawPathItem.parameters) ? rawPathItem.parameters : [];

    for (const lowerMethod of HTTP_METHODS) {
      const rawOp = rawPathItem[lowerMethod];
      if (!isRecord(rawOp)) continue;
      if (rawOp.deprecated === true) continue;

      const sdkMeta = FastGptSdkMetaSchema.parse(rawOp['x-fastgpt-sdk']);
      const httpMethod = lowerMethod.toUpperCase() as IrHttpMethod;
      const typePrefix = toOperationPascalPrefix({
        resource: sdkMeta.resource,
        method: sdkMeta.method
      });

      // 1. 提取并归一化 path / query 参数（自动展开 explode=true 的联合 query 对象，剔除废弃 query 参数与鉴权头）
      const allRawParams = [
        ...pathLevelParams,
        ...(Array.isArray(rawOp.parameters) ? rawOp.parameters : [])
      ];

      const pathProperties: IrProperty[] = [];
      const queryProperties: IrProperty[] = [];

      for (const param of allRawParams) {
        if (!isRecord(param)) continue;
        if (
          param.deprecated === true ||
          (isRecord(param.schema) && param.schema.deprecated === true)
        ) {
          continue;
        }

        const paramIn = param.in;
        const paramName = typeof param.name === 'string' ? param.name : '';
        if (!paramName) continue;

        if (paramIn === 'header' && paramName.toLowerCase() === 'authorization') {
          continue;
        }

        if (paramIn === 'path') {
          const schema = normalizeJsonSchemaToIr({
            rawSchema: param.schema,
            rootDoc,
            mode: 'requestNested'
          });
          const desc =
            typeof param.description === 'string' ? param.description : schema.description;
          pathProperties.push({
            name: paramName,
            schema,
            required: true,
            ...(desc !== undefined ? { description: desc } : {})
          });
          continue;
        }

        if (paramIn === 'query') {
          if (paramName === 'query' && param.explode === true && isRecord(param.schema)) {
            const flattenedQueryObj = normalizeRequestObjectToIr({
              rawSchema: param.schema,
              rootDoc
            });
            queryProperties.push(...flattenedQueryObj.properties);
          } else {
            if (shouldStripRequestProperty(paramName, param.schema)) {
              continue;
            }
            const schema = normalizeJsonSchemaToIr({
              rawSchema: param.schema,
              rootDoc,
              mode: 'requestNested'
            });
            const desc =
              typeof param.description === 'string' ? param.description : schema.description;
            queryProperties.push({
              name: paramName,
              schema,
              required: param.required === true,
              ...(desc !== undefined ? { description: desc } : {})
            });
          }
        }
      }

      // 2. 提取并扁平化请求体（支持 application/json、两类 multipart/form-data 及二进制流）
      const reqContent =
        isRecord(rawOp.requestBody) && isRecord(rawOp.requestBody.content)
          ? rawOp.requestBody.content
          : {};

      let requestContentType: IrRequestContentType = 'none';
      let multipartMode: IrMultipartMode | undefined;
      let binaryBodyField: string | undefined;
      const bodyProperties: IrProperty[] = [];
      let bodyUnionVariants: IrRequestObjectSchema[] | null = null;

      if (isRecord(reqContent['application/json'])) {
        requestContentType = 'json';
        const stripStream = (props: IrProperty[]): IrProperty[] =>
          sdkMeta.streamMethod !== undefined
            ? props.filter((prop) => prop.name !== 'stream')
            : props;

        const normalizedBody = normalizeRequestSchemaToIr({
          rawSchema: reqContent['application/json'].schema,
          rootDoc
        });

        if (normalizedBody.kind === 'union') {
          bodyUnionVariants = normalizedBody.variants.map((variant) => ({
            ...variant,
            properties: stripStream(variant.properties)
          }));
          const flattenedBody = mergeIrObjectSchemas({
            objects: bodyUnionVariants,
            mode: 'or'
          });
          for (const prop of flattenedBody.properties) {
            if (prop.schema.kind === 'never') continue;
            bodyProperties.push(prop);
          }
        } else {
          for (const prop of stripStream(normalizedBody.properties)) {
            if (prop.schema.kind === 'never') continue;
            bodyProperties.push(prop);
          }
        }
      } else if (isRecord(reqContent['multipart/form-data'])) {
        requestContentType = 'multipart';
        const mpMedia = reqContent['multipart/form-data'];
        const mpSchema = isRecord(mpMedia.schema) ? mpMedia.schema : {};
        const mpProps = isRecord(mpSchema.properties) ? mpSchema.properties : {};
        const mpEncoding = isRecord(mpMedia.encoding) ? mpMedia.encoding : {};
        const isJsonEncodedData =
          isRecord(mpEncoding.data) &&
          mpEncoding.data.contentType === 'application/json' &&
          isRecord(mpProps.data);

        if (isJsonEncodedData) {
          multipartMode = 'fileAndJsonData';
          if (mpProps.file !== undefined) {
            const fileSchema = normalizeJsonSchemaToIr({
              rawSchema: mpProps.file,
              rootDoc,
              mode: 'requestNested'
            });
            const fileDesc =
              (isRecord(mpProps.file) && typeof mpProps.file.description === 'string'
                ? mpProps.file.description
                : undefined) ?? fileSchema.description;
            bodyProperties.push({
              name: 'file',
              schema: fileSchema.kind === 'binary' ? fileSchema : { kind: 'binary' },
              required: true,
              ...(fileDesc !== undefined ? { description: fileDesc } : {})
            });
          }

          const flattenedDataObj = normalizeRequestObjectToIr({
            rawSchema: mpProps.data,
            rootDoc
          });
          bodyProperties.push(...flattenedDataObj.properties);
        } else {
          multipartMode = 'flatFields';
          const flattenedMp = normalizeRequestObjectToIr({
            rawSchema: mpSchema,
            rootDoc
          });
          bodyProperties.push(...flattenedMp.properties);
        }
      } else if (isRecord(reqContent['application/octet-stream'])) {
        requestContentType = 'octet-stream';
        binaryBodyField = 'file';
        const octSchema = isRecord(reqContent['application/octet-stream'].schema)
          ? reqContent['application/octet-stream'].schema
          : {};
        const octDesc =
          typeof octSchema.description === 'string'
            ? octSchema.description
            : '待上传的原始二进制文件内容';
        bodyProperties.push({
          name: 'file',
          schema: { kind: 'binary', description: octDesc },
          required: true,
          description: octDesc
        });
      }

      const pathParams = pathProperties.map((p) => p.name);
      const queryParams = queryProperties.map((p) => p.name);
      const bodyParams = bodyProperties
        .map((p) => p.name)
        .filter((name) => name !== binaryBodyField);

      // 3. 识别 defaultAppId 与 customUid / authProxy 的自动注入载体，并将 appId 放宽为可选以兼容 defaultAppId
      const appIdCarrier: IrContextCarrier = (() => {
        if (queryParams.includes('appId')) return 'query';
        if (bodyParams.includes('appId')) {
          return multipartMode === 'fileAndJsonData' ? 'multipartData' : 'body';
        }
        return null;
      })();

      const identityCarrier: IrContextCarrier = (() => {
        const hasIdentityInQuery =
          queryParams.includes('customUid') || queryParams.includes('authProxy');
        if (hasIdentityInQuery) return 'query';

        const hasIdentityInBody =
          bodyParams.includes('customUid') || bodyParams.includes('authProxy');
        if (hasIdentityInBody) {
          return multipartMode === 'fileAndJsonData' ? 'multipartData' : 'body';
        }
        return null;
      })();

      const structuredAuthProxyQuerySchema: IrSchema = {
        kind: 'union',
        variants: [
          {
            kind: 'object',
            properties: [
              {
                name: 'tmbId',
                schema: { kind: 'primitive', type: 'string' },
                required: true,
                description: 'API Key 代理调用的团队成员 ID，优先于 username'
              }
            ]
          },
          {
            kind: 'object',
            properties: [
              {
                name: 'username',
                schema: { kind: 'primitive', type: 'string' },
                required: true,
                description: 'API Key 代理调用的团队成员用户名'
              }
            ]
          },
          {
            kind: 'primitive',
            type: 'string'
          }
        ]
      };

      const normalizedQueryProperties: IrProperty[] = queryProperties.map((prop) =>
        prop.name === 'authProxy' &&
        prop.schema.kind === 'primitive' &&
        prop.schema.type === 'string'
          ? {
              ...prop,
              schema: structuredAuthProxyQuerySchema
            }
          : prop
      );

      const relaxAppIdProp = (prop: IrProperty): IrProperty =>
        prop.name === 'appId' && appIdCarrier !== null
          ? {
              ...prop,
              required: false
            }
          : prop;

      const unifiedMap = new Map<string, IrProperty>();
      for (const prop of [...pathProperties, ...normalizedQueryProperties, ...bodyProperties]) {
        const adjustedProp = relaxAppIdProp(prop);
        unifiedMap.set(adjustedProp.name, adjustedProp);
      }
      const unifiedProperties = [...unifiedMap.values()];

      const sharedNonBodyProps = [...pathProperties, ...normalizedQueryProperties].map(
        relaxAppIdProp
      );

      // 根据顶层联合分支或 OpenAPI x-required-parameter-alternatives 构造最终请求 Schema，
      // 确保“多选一必填”与严格互斥分支（如 datasets.collections.delete）在 IR 和类型签名中不被拍平丢失。
      const finalRequestSchema: IrRequestSchema = (() => {
        if (bodyUnionVariants !== null) {
          const combinedVariants: IrRequestObjectSchema[] = bodyUnionVariants.map((variant) => {
            const propMap = new Map<string, IrProperty>();
            for (const prop of sharedNonBodyProps) {
              propMap.set(prop.name, prop);
            }
            for (const prop of variant.properties) {
              propMap.set(prop.name, relaxAppIdProp(prop));
            }
            return {
              ...variant,
              properties: [...propMap.values()]
            };
          });

          if (shouldPreserveRequestObjectUnion(combinedVariants)) {
            return {
              kind: 'union',
              variants: combinedVariants
            };
          }

          return mergeIrObjectSchemas({
            objects: combinedVariants,
            mode: 'or'
          });
        }

        const baseObject: IrRequestObjectSchema = {
          kind: 'object',
          properties: unifiedProperties
        };

        const rawAlternatives = rawOp['x-required-parameter-alternatives'];
        if (Array.isArray(rawAlternatives) && unifiedProperties.length > 0) {
          const pathParamSet = new Set(pathParams);
          const queryParamSet = new Set(queryParams);
          const bodyParamSet = new Set(bodyParams);
          const seenBranchKeys = new Set<string>();
          const alternativeVariants: IrRequestObjectSchema[] = [];

          for (const rawBranch of rawAlternatives) {
            if (!Array.isArray(rawBranch) || rawBranch.length === 0) continue;
            const requiredNames: string[] = [];
            let branchSupported = true;

            for (const item of rawBranch) {
              if (!isRecord(item) || typeof item.name !== 'string') {
                branchSupported = false;
                break;
              }
              const paramIn = typeof item.in === 'string' ? item.in : undefined;
              const matchesCarrier =
                (paramIn === 'path' && pathParamSet.has(item.name)) ||
                (paramIn === 'query' && queryParamSet.has(item.name)) ||
                (paramIn === 'body' && bodyParamSet.has(item.name)) ||
                (paramIn === undefined && unifiedMap.has(item.name));
              if (!matchesCarrier || !unifiedMap.has(item.name)) {
                branchSupported = false;
                break;
              }
              requiredNames.push(item.name);
            }

            if (!branchSupported || requiredNames.length === 0) continue;
            const sig = [...requiredNames].sort().join(',');
            if (seenBranchKeys.has(sig)) continue;
            seenBranchKeys.add(sig);

            const reqSet = new Set(requiredNames);
            alternativeVariants.push({
              kind: 'object',
              properties: unifiedProperties.map((prop) =>
                reqSet.has(prop.name) ? { ...prop, required: true } : prop
              )
            });
          }

          if (shouldPreserveRequestObjectUnion(alternativeVariants)) {
            return {
              kind: 'union',
              variants: alternativeVariants
            };
          }
        }

        return baseObject;
      })();

      const hasInput =
        finalRequestSchema.kind === 'union'
          ? finalRequestSchema.variants.some((v) => v.properties.length > 0)
          : finalRequestSchema.properties.length > 0;
      const hasRequiredInput =
        finalRequestSchema.kind === 'union'
          ? finalRequestSchema.variants.length > 0 &&
            finalRequestSchema.variants.every((v) => v.properties.some((p) => p.required))
          : finalRequestSchema.properties.some((p) => p.required);

      // 4. 解析 200 成功响应模式与返回类型
      const responsesObj = isRecord(rawOp.responses) ? rawOp.responses : {};
      const resp200 = isRecord(responsesObj['200']) ? responsesObj['200'] : {};
      const respContent = isRecord(resp200.content) ? resp200.content : {};

      const { responseMode, responseSchema } = ((): {
        responseMode: IrResponseMode;
        responseSchema?: IrSchema;
      } => {
        if (isRecord(respContent['application/json'])) {
          const rawRespSchema = respContent['application/json'].schema;
          if (isNeverJsonSchema(rawRespSchema)) {
            return { responseMode: 'void' };
          }

          const mode: IrResponseMode = RAW_JSON_RESPONSE_PATHS.has(routePath)
            ? 'rawJson'
            : 'envelope';
          return {
            responseMode: mode,
            responseSchema: normalizeJsonSchemaToIr({
              rawSchema: rawRespSchema,
              rootDoc,
              mode: 'response'
            })
          };
        }

        if (isRecord(respContent['text/csv'])) {
          return {
            responseMode: 'text',
            responseSchema: {
              kind: 'primitive',
              type: 'string',
              description:
                typeof resp200.description === 'string' ? resp200.description : 'CSV 文本内容'
            }
          };
        }

        if (
          isRecord(respContent['audio/mpeg']) ||
          isRecord(respContent['application/zip']) ||
          isRecord(respContent['application/octet-stream'])
        ) {
          return {
            responseMode: 'binary',
            responseSchema: {
              kind: 'binary',
              description:
                typeof resp200.description === 'string' ? resp200.description : '二进制文件数据'
            }
          };
        }

        return { responseMode: 'void' };
      })();

      operations.push({
        id: `${sdkMeta.resource}.${sdkMeta.method}`,
        resource: sdkMeta.resource,
        method: sdkMeta.method,
        ...(sdkMeta.streamMethod !== undefined ? { streamMethod: sdkMeta.streamMethod } : {}),
        httpMethod,
        path: routePath,
        summary: typeof rawOp.summary === 'string' ? rawOp.summary : '',
        ...(typeof rawOp.description === 'string' ? { description: rawOp.description } : {}),
        requestContentType,
        ...(multipartMode !== undefined ? { multipartMode } : {}),
        responseMode,
        appIdCarrier,
        identityCarrier,
        pathParams,
        queryParams,
        bodyParams,
        ...(binaryBodyField !== undefined ? { binaryBodyField } : {}),
        hasRequiredInput,
        ...(hasInput
          ? {
              requestTypeName: `${typePrefix}Req`,
              requestSchema: finalRequestSchema
            }
          : {}),
        ...(responseSchema !== undefined
          ? {
              responseTypeName: `${typePrefix}Res`,
              responseSchema
            }
          : {})
      });
    }
  }

  const sortedOps = [...operations].sort((a, b) => a.id.localeCompare(b.id));
  const infoObj = isRecord(rootDoc.info) ? rootDoc.info : {};

  return {
    irVersion: '1.0.0',
    title: typeof infoObj.title === 'string' ? infoObj.title : 'FastGPT System OpenAPI',
    openApiVersion: typeof rootDoc.openapi === 'string' ? rootDoc.openapi : '3.1.0',
    operationCount: sortedOps.length,
    resources: buildResourceTree(sortedOps),
    operations: sortedOps
  };
};
