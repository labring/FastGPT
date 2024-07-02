import { getNanoid } from '../../../common/string/tools';
import { OpenApiJsonSchema } from './type';
import yaml from 'js-yaml';
import { OpenAPIV3 } from 'openapi-types';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from '../../workflow/type/io';
import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum } from '../../workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '../../workflow/constants';
import { PluginInputModule } from '../../workflow/template/system/pluginInput';
import { PluginOutputModule } from '../../workflow/template/system/pluginOutput';
import { HttpNode468 } from '../../workflow/template/system/http468';
import { HttpParamAndHeaderItemType } from '../../workflow/api';
import { StoreNodeItemType } from '../../workflow/type/node';
import { HttpImgUrl } from '../../../common/file/image/constants';
import SwaggerParser from '@apidevtools/swagger-parser';
import { getHandleId } from '../../workflow/utils';
import { CreateHttpPluginChildrenPros } from '../controller';
import { AppTypeEnum } from '../constants';
import type { StoreEdgeItemType } from '../../workflow/type/edge';

export const str2OpenApiSchema = async (yamlStr = ''): Promise<OpenApiJsonSchema> => {
  try {
    const data = (() => {
      try {
        return JSON.parse(yamlStr);
      } catch (jsonError) {
        return yaml.load(yamlStr, { schema: yaml.FAILSAFE_SCHEMA });
      }
    })();
    const jsonSchema = (await SwaggerParser.parse(data)) as OpenAPIV3.Document;

    const serverPath = jsonSchema.servers?.[0].url || '';
    const pathData = Object.keys(jsonSchema.paths)
      .map((path) => {
        const methodData: any = data.paths[path];
        return Object.keys(methodData)
          .filter((method) =>
            ['get', 'post', 'put', 'delete', 'patch'].includes(method.toLocaleLowerCase())
          )
          .map((method) => {
            const methodInfo = methodData[method];
            if (methodInfo.deprecated) return;
            const result = {
              path,
              method,
              name: methodInfo.operationId || path,
              description: methodInfo.description || methodInfo.summary,
              params: methodInfo.parameters,
              request: methodInfo?.requestBody,
              response: methodInfo.responses
            };
            return result;
          });
      })
      .flat()
      .filter(Boolean) as OpenApiJsonSchema['pathData'];
    return { pathData, serverPath };
  } catch (err) {
    throw new Error('Invalid Schema');
  }
};

export const getType = (schema: { type: string; items?: { type: string } }) => {
  const typeMap: { [key: string]: WorkflowIOValueTypeEnum } = {
    string: WorkflowIOValueTypeEnum.arrayString,
    number: WorkflowIOValueTypeEnum.arrayNumber,
    integer: WorkflowIOValueTypeEnum.arrayNumber,
    boolean: WorkflowIOValueTypeEnum.arrayBoolean,
    object: WorkflowIOValueTypeEnum.arrayObject
  };

  if (schema?.type === 'integer') {
    return WorkflowIOValueTypeEnum.number;
  }

  if (schema?.type === 'array' && schema?.items) {
    const itemType = typeMap[schema.items.type];
    if (itemType) {
      return itemType;
    }
  }

  return schema?.type as WorkflowIOValueTypeEnum;
};

export const httpApiSchema2Plugins = async ({
  parentId,
  apiSchemaStr = '',
  customHeader = ''
}: {
  parentId: string;
  apiSchemaStr?: string;
  customHeader?: string;
}): Promise<CreateHttpPluginChildrenPros[]> => {
  const jsonSchema = await str2OpenApiSchema(apiSchemaStr);

  const baseUrl = jsonSchema.serverPath;

  return jsonSchema.pathData.map((item) => {
    const pluginOutputId = getNanoid();
    const httpId = getNanoid();
    const pluginInputId = getNanoid();
    const inputIdMap = new Map();

    const pluginOutputKey = 'result';

    const properties = item.request?.content?.['application/json']?.schema?.properties;
    const propsKeys = properties ? Object.keys(properties) : [];

    const pluginInputs: FlowNodeInputItemType[] = [
      ...(item.params?.map((param: any) => {
        return {
          key: param.name,
          valueType: getType(param.schema),
          label: param.name,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          required: param.required,
          description: param.description,
          toolDescription: param.description,
          canEdit: true
        };
      }) || []),
      ...(propsKeys?.map((key) => {
        const prop = properties[key];
        return {
          key,
          valueType: getType(prop),
          label: key,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          required: false,
          description: prop.description,
          toolDescription: prop.description,
          canEdit: true
        };
      }) || [])
    ];

    const pluginOutputs: FlowNodeOutputItemType[] = [
      ...(item.params?.map((param: any) => {
        const id = getNanoid();
        inputIdMap.set(param.name, id);
        return {
          id,
          key: param.name,
          valueType: getType(param.schema),
          label: param.name,
          type: FlowNodeOutputTypeEnum.source
        };
      }) || []),
      ...(propsKeys?.map((key) => {
        const id = getNanoid();
        inputIdMap.set(key, id);
        return {
          id,
          key,
          valueType: getType(properties[key]),
          label: key,
          type: FlowNodeOutputTypeEnum.source,
          edit: true
        };
      }) || [])
    ];

    const httpInputs: FlowNodeInputItemType[] = [
      ...(item.params?.map((param: any) => {
        return {
          key: param.name,
          valueType: getType(param.schema),
          label: param.name,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          canEdit: true,
          value: [pluginInputId, inputIdMap.get(param.name)]
        };
      }) || []),
      ...(propsKeys?.map((key) => {
        return {
          key,
          valueType: getType(properties[key]),
          label: key,
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          canEdit: true,
          value: [pluginInputId, inputIdMap.get(key)]
        };
      }) || [])
    ];

    /* http node setting */
    const httpNodeParams: HttpParamAndHeaderItemType[] = [];
    const httpNodeHeaders: HttpParamAndHeaderItemType[] = [];
    let httpNodeBody = '{}';
    const requestUrl = `${baseUrl}${item.path}`;

    if (item.params && item.params.length > 0) {
      for (const param of item.params) {
        if (param.in === 'header') {
          httpNodeHeaders.push({
            key: param.name,
            type: getType(param.schema) || WorkflowIOValueTypeEnum.string,
            value: `{{${param.name}}}`
          });
        } else if (param.in === 'body') {
          httpNodeBody = JSON.stringify(
            { ...JSON.parse(httpNodeBody), [param.name]: `{{${param.name}}}` },
            null,
            2
          );
        } else if (param.in === 'query') {
          httpNodeParams.push({
            key: param.name,
            type: getType(param.schema) || WorkflowIOValueTypeEnum.string,
            value: `{{${param.name}}}`
          });
        }
      }
    }
    if (item.request) {
      const properties = item.request?.content?.['application/json']?.schema?.properties || {};
      const keys = Object.keys(properties);
      if (keys.length > 0) {
        httpNodeBody = JSON.stringify(
          keys.reduce((acc: any, key) => {
            acc[key] = `{{${key}}}`;
            return acc;
          }, {}),
          null,
          2
        );
      }
    }
    if (customHeader) {
      const headersObj = (() => {
        try {
          return JSON.parse(customHeader) as Record<string, string>;
        } catch (err) {
          return {};
        }
      })();
      for (const key in headersObj) {
        httpNodeHeaders.push({
          key,
          type: WorkflowIOValueTypeEnum.string,
          // @ts-ignore
          value: headersObj[key]
        });
      }
    }

    /* Combine complete modules */
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: pluginInputId,
        name: PluginInputModule.name,
        intro: PluginInputModule.intro,
        avatar: PluginInputModule.avatar,
        flowNodeType: PluginInputModule.flowNodeType,
        showStatus: PluginInputModule.showStatus,
        position: {
          x: 473.55206291900333,
          y: -145.65080850146154
        },
        version: PluginInputModule.version,
        inputs: pluginInputs,
        outputs: pluginOutputs
      },
      {
        nodeId: pluginOutputId,
        name: PluginOutputModule.name,
        intro: PluginOutputModule.intro,
        avatar: PluginOutputModule.avatar,
        flowNodeType: PluginOutputModule.flowNodeType,
        showStatus: PluginOutputModule.showStatus,
        position: {
          x: 1847.5956872650024,
          y: 5.114324648101558
        },
        version: PluginOutputModule.version,
        inputs: [
          {
            key: pluginOutputKey,
            valueType: WorkflowIOValueTypeEnum.string,
            label: pluginOutputKey,
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            required: false,
            description: '',
            canEdit: true,
            value: [httpId, 'httpRawResponse']
          }
        ],
        outputs: [
          {
            id: pluginOutputId,
            key: pluginOutputKey,
            valueType: WorkflowIOValueTypeEnum.string,
            label: pluginOutputKey,
            type: FlowNodeOutputTypeEnum.static
          }
        ]
      },
      {
        nodeId: httpId,
        name: HttpNode468.name,
        intro: HttpNode468.intro,
        avatar: HttpNode468.avatar,
        flowNodeType: HttpNode468.flowNodeType,
        showStatus: true,
        position: {
          x: 1188.947986995841,
          y: -473.52694296182904
        },
        version: HttpNode468.version,
        inputs: [
          HttpNode468.inputs[0],
          ...httpInputs,
          {
            key: 'system_httpMethod',
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            valueType: WorkflowIOValueTypeEnum.string,
            label: '',
            value: item.method.toUpperCase(),
            required: true
          },
          {
            key: 'system_httpReqUrl',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.string,
            label: '',
            description: 'core.module.input.description.Http Request Url',
            placeholder: 'https://api.ai.com/getInventory',
            required: false,
            value: requestUrl
          },
          {
            key: 'system_httpHeader',
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            valueType: WorkflowIOValueTypeEnum.any,
            value: httpNodeHeaders,
            label: '',
            description: 'core.module.input.description.Http Request Header',
            placeholder: 'core.module.input.description.Http Request Header',
            required: false
          },
          {
            key: 'system_httpParams',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            value: httpNodeParams,
            label: '',
            required: false
          },
          {
            key: 'system_httpJsonBody',
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            valueType: WorkflowIOValueTypeEnum.any,
            value: httpNodeBody,
            label: '',
            required: false
          }
        ],
        outputs: HttpNode468.outputs
      }
    ];

    const edges: StoreEdgeItemType[] = [
      {
        source: pluginInputId,
        target: httpId,
        sourceHandle: getHandleId(pluginInputId, 'source', 'right'),
        targetHandle: getHandleId(httpId, 'target', 'left')
      },
      {
        source: httpId,
        target: pluginOutputId,
        sourceHandle: getHandleId(httpId, 'source', 'right'),
        targetHandle: getHandleId(pluginOutputId, 'target', 'left')
      }
    ];

    return {
      name: item.name,
      avatar: HttpImgUrl,
      intro: item.description,
      parentId,
      type: AppTypeEnum.plugin,
      modules: nodes,
      edges,
      pluginData: {
        pluginUniId: item.name
      }
    };
  });
};
