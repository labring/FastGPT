import { getNanoid } from '../../../common/string/tools';
import { OpenApiJsonSchema } from './type';
import yaml from 'js-yaml';
import { OpenAPIV3 } from 'openapi-types';
import { PluginTypeEnum } from '../constants';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from '../../module/node/type';
import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum } from '../../module/node/constant';
import { ModuleIOValueTypeEnum } from '../../module/constants';
import { PluginInputModule } from '../../module/template/system/pluginInput';
import { PluginOutputModule } from '../../module/template/system/pluginOutput';
import { HttpModule468 } from '../../module/template/system/http468';
import { HttpParamAndHeaderItemType } from '../../module/api';
import { CreateOnePluginParams } from '../controller';
import { ModuleItemType } from '../../module/type';
import { HttpImgUrl } from '../../../common/file/image/constants';
import SwaggerParser from '@apidevtools/swagger-parser';

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

export const httpApiSchema2Plugins = async ({
  parentId,
  apiSchemaStr = '',
  customHeader = ''
}: {
  parentId: string;
  apiSchemaStr?: string;
  customHeader?: string;
}): Promise<CreateOnePluginParams[]> => {
  const jsonSchema = await str2OpenApiSchema(apiSchemaStr);

  const baseUrl = jsonSchema.serverPath;

  return jsonSchema.pathData.map((item) => {
    const pluginOutputId = getNanoid();
    const httpId = getNanoid();
    const pluginOutputKey = 'result';

    const properties = item.request?.content?.['application/json']?.schema?.properties;
    const propsKeys = properties ? Object.keys(properties) : [];

    const pluginInputs: FlowNodeInputItemType[] = [
      ...(item.params?.map((param: any) => {
        return {
          key: param.name,
          valueType: ModuleIOValueTypeEnum.string,
          label: param.name,
          type: FlowNodeInputTypeEnum.target,
          required: param.required,
          description: param.description,
          edit: true,
          editField: {
            key: true,
            name: true,
            description: true,
            required: true,
            dataType: true,
            inputType: true,
            isToolInput: true
          },
          connected: true,
          toolDescription: param.description
        };
      }) || []),
      ...(propsKeys?.map((key) => {
        const prop = properties[key];
        return {
          key,
          valueType: ModuleIOValueTypeEnum.string,
          label: key,
          type: FlowNodeInputTypeEnum.target,
          required: false,
          description: prop.description,
          edit: true,
          editField: {
            key: true,
            name: true,
            description: true,
            required: true,
            dataType: true,
            inputType: true,
            isToolInput: true
          },
          connected: true,
          toolDescription: prop.description
        };
      }) || [])
    ];

    const pluginOutputs: FlowNodeOutputItemType[] = [
      ...(item.params?.map((param: any) => {
        return {
          key: param.name,
          valueType: ModuleIOValueTypeEnum.string,
          label: param.name,
          type: FlowNodeOutputTypeEnum.source,
          edit: true,
          targets: [
            {
              moduleId: httpId,
              key: param.name
            }
          ]
        };
      }) || []),
      ...(propsKeys?.map((key) => {
        return {
          key,
          valueType: ModuleIOValueTypeEnum.string,
          label: key,
          type: FlowNodeOutputTypeEnum.source,
          edit: true,
          targets: [
            {
              moduleId: httpId,
              key
            }
          ]
        };
      }) || [])
    ];

    const httpInputs: FlowNodeInputItemType[] = [
      ...(item.params?.map((param: any) => {
        return {
          key: param.name,
          valueType: ModuleIOValueTypeEnum.string,
          label: param.name,
          type: FlowNodeInputTypeEnum.target,
          description: param.description,
          edit: true,
          editField: {
            key: true,
            description: true,
            dataType: true
          },
          connected: true
        };
      }) || []),
      ...(propsKeys?.map((key) => {
        const prop = properties[key];
        return {
          key,
          valueType: ModuleIOValueTypeEnum.string,
          label: key,
          type: FlowNodeInputTypeEnum.target,
          description: prop.description,
          edit: true,
          editField: {
            key: true,
            description: true,
            dataType: true
          },
          connected: true
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
            type: param.schema?.type || ModuleIOValueTypeEnum.string,
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
            type: param.schema?.type || ModuleIOValueTypeEnum.string,
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
          type: 'string',
          // @ts-ignore
          value: headersObj[key]
        });
      }
    }

    /* Combine complete modules */
    const modules: ModuleItemType[] = [
      {
        moduleId: getNanoid(),
        name: PluginInputModule.name,
        intro: PluginInputModule.intro,
        avatar: PluginInputModule.avatar,
        flowType: PluginInputModule.flowType,
        showStatus: PluginInputModule.showStatus,
        position: {
          x: 616.4226348688949,
          y: -165.05298493910115
        },
        inputs: [
          {
            key: 'pluginStart',
            type: 'hidden',
            valueType: 'boolean',
            label: '插件开始运行',
            description:
              '插件开始运行时，会输出一个 True 的标识。有时候，插件不会有额外的的输入，为了顺利的进入下一个阶段，你可以将该值连接到下一个节点的触发器中。',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: true
          },
          ...pluginInputs
        ],
        outputs: [
          {
            key: 'pluginStart',
            label: '插件开始运行',
            type: 'source',
            valueType: 'boolean',
            targets:
              pluginOutputs.length === 0
                ? [
                    {
                      moduleId: httpId,
                      key: 'switch'
                    }
                  ]
                : []
          },
          ...pluginOutputs
        ]
      },
      {
        moduleId: pluginOutputId,
        name: PluginOutputModule.name,
        intro: PluginOutputModule.intro,
        avatar: PluginOutputModule.avatar,
        flowType: PluginOutputModule.flowType,
        showStatus: PluginOutputModule.showStatus,
        position: {
          x: 1607.7142331269126,
          y: -151.8669210746189
        },
        inputs: [
          {
            key: pluginOutputKey,
            valueType: 'string',
            label: pluginOutputKey,
            type: 'target',
            required: true,
            description: '',
            edit: true,
            editField: {
              key: true,
              name: true,
              description: true,
              required: false,
              dataType: true,
              inputType: false
            },
            connected: true
          }
        ],
        outputs: [
          {
            key: pluginOutputKey,
            valueType: 'string',
            label: pluginOutputKey,
            type: 'source',
            edit: true,
            targets: []
          }
        ]
      },
      {
        moduleId: httpId,
        name: HttpModule468.name,
        intro: HttpModule468.intro,
        avatar: HttpModule468.avatar,
        flowType: HttpModule468.flowType,
        showStatus: true,
        position: {
          x: 1042.549746602742,
          y: -447.77496332641647
        },
        inputs: [
          {
            key: 'switch',
            type: 'target',
            label: 'core.module.input.label.switch',
            description: 'core.module.input.description.Trigger',
            valueType: 'any',
            showTargetInApp: true,
            showTargetInPlugin: true,
            connected: false
          },
          {
            key: 'system_httpMethod',
            type: 'custom',
            valueType: 'string',
            label: '',
            value: item.method.toUpperCase(),
            required: true,
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'system_httpReqUrl',
            type: 'hidden',
            valueType: 'string',
            label: '',
            description: 'core.module.input.description.Http Request Url',
            placeholder: 'https://api.ai.com/getInventory',
            required: false,
            showTargetInApp: false,
            showTargetInPlugin: false,
            value: requestUrl,
            connected: false
          },
          {
            key: 'system_httpHeader',
            type: 'custom',
            valueType: 'any',
            value: httpNodeHeaders,
            label: '',
            description: 'core.module.input.description.Http Request Header',
            placeholder: 'core.module.input.description.Http Request Header',
            required: false,
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'system_httpParams',
            type: 'hidden',
            valueType: 'any',
            value: httpNodeParams,
            label: '',
            required: false,
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'system_httpJsonBody',
            type: 'hidden',
            valueType: 'any',
            value: httpNodeBody,
            label: '',
            required: false,
            showTargetInApp: false,
            showTargetInPlugin: false,
            connected: false
          },
          {
            key: 'DYNAMIC_INPUT_KEY',
            type: 'target',
            valueType: 'any',
            label: 'core.module.inputType.dynamicTargetInput',
            description: 'core.module.input.description.dynamic input',
            required: false,
            showTargetInApp: false,
            showTargetInPlugin: true,
            hideInApp: true,
            connected: false
          },
          {
            key: 'system_addInputParam',
            type: 'addInputParam',
            valueType: 'any',
            label: '',
            required: false,
            showTargetInApp: false,
            showTargetInPlugin: false,
            editField: {
              key: true,
              description: true,
              dataType: true
            },
            defaultEditField: {
              label: '',
              key: '',
              description: '',
              inputType: 'target',
              valueType: 'string'
            },
            connected: false
          },
          ...httpInputs
        ],
        outputs: [
          {
            key: 'finish',
            label: 'core.module.output.label.running done',
            description: 'core.module.output.description.running done',
            valueType: 'boolean',
            type: 'source',
            targets: []
          },
          {
            key: 'httpRawResponse',
            label: '原始响应',
            description: 'HTTP请求的原始响应。只能接受字符串或JSON类型响应数据。',
            valueType: 'any',
            type: 'source',
            targets: [
              {
                moduleId: pluginOutputId,
                key: pluginOutputKey
              }
            ]
          },
          {
            key: 'system_addOutputParam',
            type: 'addOutputParam',
            valueType: 'any',
            label: '',
            targets: [],
            editField: {
              key: true,
              description: true,
              dataType: true,
              defaultValue: true
            },
            defaultEditField: {
              label: '',
              key: '',
              description: '',
              outputType: 'source',
              valueType: 'string'
            }
          }
        ]
      }
    ];

    return {
      name: item.name,
      avatar: HttpImgUrl,
      intro: item.description,
      parentId,
      type: PluginTypeEnum.http,
      modules
    };
  });
};
