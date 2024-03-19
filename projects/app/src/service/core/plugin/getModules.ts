import { MethodType } from '@fastgpt/global/core/plugin/controller';
import yaml from 'js-yaml';
import { OpenAPIV3 } from 'openapi-types';
import { customAlphabet } from 'nanoid';
import { PluginTypeEnum } from '@fastgpt/global/core/plugin/constants';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

export type PathDataType = {
  name: string;
  description: string;
  method: string;
  path: string;
  params: any[];
  request: any;
};

export type ApiData = {
  pathData: PathDataType[];
  serverPath: string;
};

export const getModules = (props: any) => {
  return [
    {
      moduleId: props.inputId,
      name: '定义插件输入',
      intro: '自定义配置外部输入，使用插件时，仅暴露自定义配置的输入',
      avatar: '/imgs/module/input.png',
      flowType: 'pluginInput',
      showStatus: false,
      position: {
        x: 616.4226348688949,
        y: -165.05298493910115
      },
      inputs:
        props.inputInputs.length === 0
          ? [
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
              }
            ]
          : props.inputInputs,
      outputs:
        props.inputInputs.length === 0
          ? [
              {
                key: 'pluginStart',
                label: '插件开始运行',
                type: 'source',
                valueType: 'boolean',
                targets: [
                  {
                    moduleId: props.httpId,
                    key: 'switch'
                  }
                ]
              }
            ]
          : props.inputOutputs
    },
    {
      moduleId: props.outputId,
      name: '定义插件输出',
      intro: '自定义配置外部输出，使用插件时，仅暴露自定义配置的输出',
      avatar: '/imgs/module/output.png',
      flowType: 'pluginOutput',
      showStatus: false,
      position: {
        x: 1607.7142331269126,
        y: -151.8669210746189
      },
      inputs: [
        {
          key: 'result',
          valueType: 'string',
          label: 'result',
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
          key: 'result',
          valueType: 'string',
          label: 'result',
          type: 'source',
          edit: true,
          targets: []
        }
      ]
    },
    {
      moduleId: props.httpId,
      name: 'HTTP 请求',
      intro: '可以发出一个 HTTP 请求，实现更为复杂的操作（联网搜索、数据库查询等）',
      avatar: '/imgs/module/http.png',
      flowType: 'httpRequest468',
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
          value: props.method,
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
          value: props.path,
          connected: false
        },
        {
          key: 'system_httpHeader',
          type: 'custom',
          valueType: 'any',
          value: props.headers,
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
          value: props.params,
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
          value: props.body,
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
        ...(props.httpInputs || [])
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
              moduleId: props.outputId,
              key: 'result'
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
};

export const text2json = (content: string) => {
  try {
    let data: any = {};
    try {
      data = JSON.parse(content);
    } catch (jsonError) {
      try {
        data = yaml.load(content, { schema: yaml.FAILSAFE_SCHEMA });
      } catch (yamlError) {
        console.error(yamlError);
        throw new Error();
      }
    }
    return data;
  } catch (err) {
    return null;
  }
};

export const handleOpenAPI = (data: OpenAPIV3.Document) => {
  try {
    const serverPath = data.servers?.[0].url;
    const pathData = Object.keys(data.paths)
      .map((path) => {
        const methodData: any = data.paths[path];
        return Object.keys(methodData)
          .filter((method) => ['get', 'post', 'put', 'delete', 'patch'].includes(method))
          .map((method) => {
            const methodInfo = methodData[method];
            if (methodInfo.deprecated) return false;
            const result = {
              path,
              method,
              name: methodInfo.operationId || path,
              description: methodInfo.description,
              params: methodInfo.parameters,
              request: methodInfo?.requestBody
            };
            return result;
          });
      })
      .flat()
      .filter(Boolean);

    return { pathData, serverPath };
  } catch (err) {
    throw new Error('Invalid Schema');
  }
};

export const getModulesData = ({
  item,
  authMethod,
  apiData
}: {
  item: PathDataType;
  authMethod: MethodType;
  apiData: ApiData;
}) => {
  const inputId = nanoid();
  const outputId = nanoid();
  const httpId = nanoid();
  const properties = item.request?.content?.['application/json']?.schema?.properties;
  const propsKeys = properties ? Object.keys(properties) : [];

  const inputInputs = [
    ...(item.params?.map((param: any) => {
      return {
        key: param.name,
        valueType: param.schema?.type || 'string',
        label: param.name,
        type: 'target',
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
    ...(propsKeys &&
      propsKeys.map((key) => {
        const prop = properties[key];
        return {
          key,
          valueType: prop.type,
          label: key,
          type: 'target',
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
      }))
  ];

  const inputOutputs = [
    ...(item.params?.map((param: any) => {
      return {
        key: param.name,
        valueType: param.schema?.type || 'string',
        label: param.name,
        type: 'source',
        edit: true,
        targets: [
          {
            moduleId: httpId,
            key: param.name
          }
        ]
      };
    }) || []),
    ...(propsKeys &&
      propsKeys.map((key) => {
        const prop = properties[key];
        return {
          key,
          valueType: prop.type,
          label: key,
          type: 'source',
          edit: true,
          targets: [
            {
              moduleId: httpId,
              key
            }
          ]
        };
      }))
  ];

  const httpInputs = [
    ...(item.params?.map((param: any) => {
      return {
        key: param.name,
        valueType: param.schema?.type || 'string',
        label: param.name,
        type: 'target',
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
    ...(propsKeys &&
      propsKeys.map((key) => {
        const prop = properties[key];
        return {
          key,
          valueType: prop.type,
          label: key,
          type: 'target',
          description: prop.description,
          edit: true,
          editField: {
            key: true,
            description: true,
            dataType: true
          },
          connected: true
        };
      }))
  ];

  const headers = [];
  let body = '{}';
  const params = [];

  if (item.params && item.params.length > 0) {
    for (const param of item.params) {
      if (param.in === 'header') {
        headers.push({
          key: param.name,
          type: param.schema?.type || 'string',
          value: `{{${param.name}}}`
        });
      } else if (param.in === 'body') {
        body = JSON.stringify({ ...JSON.parse(body), [param.name]: `{{${param.name}}}` }, null, 2);
      } else if (param.in === 'query') {
        params.push({
          key: param.name,
          type: param.schema?.type || 'string',
          value: `{{${param.name}}}`
        });
      }
    }
  }

  if (item.request) {
    const properties = item.request?.content?.['application/json']?.schema?.properties;
    const keys = Object.keys(properties);
    if (keys.length > 0) {
      body = JSON.stringify(
        keys.reduce((acc: any, key) => {
          acc[key] = `{{${key}}}`;
          return acc;
        }, {}),
        null,
        2
      );
    }
  }

  if (authMethod.name === 'API Key') {
    headers.push({
      key: authMethod.key,
      type: 'string',
      value: `${authMethod.prefix} ${authMethod.value}`
    });
  }

  return getModules({
    inputId,
    outputId,
    httpId,
    item,
    inputInputs,
    inputOutputs,
    method: item.method.toUpperCase(),
    path: apiData.serverPath + item.path,
    headers,
    body,
    params,
    httpInputs
  });
};

export const getPluginsData = ({
  id,
  apiData,
  authMethod
}: {
  id: string;
  apiData: ApiData;
  authMethod: MethodType;
}) => {
  return apiData.pathData.map((item) => {
    const modules = getModulesData({ item, authMethod, apiData });

    return {
      avatar: '/icon/logo.svg',
      name: item.name,
      intro: item.description,
      parentId: id,
      type: PluginTypeEnum.plugin,
      schema: null,
      authMethod: null,
      modules
    };
  });
};
