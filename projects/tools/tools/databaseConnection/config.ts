import { defineTool, FlowNodeInputTypeEnum, WorkflowIOValueTypeEnum } from '@/type';

export default defineTool({
  toolId: 'community-databaseConnection',
  versionList: [
    {
      version: '1.0.0',
      description: '初始版本'
    }
  ],
  type: 'tools',
  name: {
    'zh-CN': '数据库连接',
    en: 'Database Connection'
  },
  description: {
    'zh-CN': '可连接常用数据库，并执行sql',
    en: 'Can connect to common databases and execute sql'
  },
  icon: 'core/workflow/template/datasource',
  inputs: [
    {
      renderTypeList: [FlowNodeInputTypeEnum.select, FlowNodeInputTypeEnum.reference],
      selectedTypeIndex: 0,
      valueType: WorkflowIOValueTypeEnum.string,
      key: 'databaseType',
      label: 'databaseType',
      description: '数据库的类型',
      defaultValue: '',
      list: [
        {
          label: 'MySQL',
          value: 'MySQL'
        },
        {
          label: 'PostgreSQL',
          value: 'PostgreSQL'
        },
        {
          label: 'Microsoft SQL Server',
          value: 'Microsoft SQL Server'
        }
      ],
      required: true
    },
    {
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedTypeIndex: 0,
      valueType: WorkflowIOValueTypeEnum.string,
      key: 'host',
      label: 'host',
      description: '数据库连接host',
      defaultValue: '',
      required: true,
      list: [
        {
          label: '',
          value: ''
        }
      ]
    },
    {
      renderTypeList: ['numberInput', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'number',
      key: 'port',
      label: 'port',
      description: '数据库连接端口号',
      defaultValue: '',
      required: true,
      list: [
        {
          label: '',
          value: ''
        }
      ]
    },
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'databaseName',
      label: 'databaseName',
      description: '数据库名称',
      defaultValue: '',
      required: true,
      list: [
        {
          label: '',
          value: ''
        }
      ]
    },
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'password',
      label: 'password',
      description: '数据库密码',
      defaultValue: '',
      list: [
        {
          label: '',
          value: ''
        }
      ],
      required: true
    },
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'user',
      label: 'user',
      description: '数据库账号',
      defaultValue: '',
      list: [
        {
          label: '',
          value: ''
        }
      ],
      required: true
    },
    {
      renderTypeList: ['input', 'reference'],
      selectedTypeIndex: 0,
      valueType: 'string',
      key: 'sql',
      label: 'sql',
      description: 'sql语句，可以传入sql语句直接执行',
      defaultValue: '',
      list: [
        {
          label: '',
          value: ''
        }
      ],
      required: true,
      toolDescription: 'sql语句，可以传入sql语句直接执行'
    }
  ],
  outputs: [
    {
      id: 'result',
      type: 'static',
      key: 'result',
      label: '结果',
      description: '执行结果',
      valueType: 'string'
    }
  ]
});
