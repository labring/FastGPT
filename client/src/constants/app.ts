import type { ModuleItemCommonType, ModuleItemType, AppItemType } from '@/types/app';

/* flow module */
export enum ModuleInputItemTypeEnum {
  system = 'system',
  numberInput = 'numberInput',
  select = 'select',
  slider = 'slider'
}
export enum ModulesInputItemTypeEnum {
  system = 'system'
}

export const HistoryInputModule: ModuleItemCommonType = {
  key: 'history',
  label: '聊天记录',
  description: '',
  formType: ModuleInputItemTypeEnum.system
};
export const UserInputModule: ModuleItemCommonType = {
  key: 'userChatInput',
  label: '用户输入',
  description: '',
  formType: ModuleInputItemTypeEnum.system
};

export const UserChatInputModule: ModuleItemType = {
  moduleId: '',
  avatar: '/imgs/logo.png',
  name: '用户问题输入',
  description: '',
  url: '',
  body: [],
  inputs: [UserInputModule],
  outputs: [
    {
      key: 'chatInput',
      targets: []
    }
  ]
};

export const HistoryModule: ModuleItemType = {
  moduleId: '',
  avatar: '/imgs/logo.png',
  name: '聊天记录',
  description: '',
  url: '/openapi/chat/getHistory',
  body: [
    {
      key: 'historyLen',
      label: '最大记录数',
      formType: ModuleInputItemTypeEnum.numberInput,
      placeholder: '',
      max: 30,
      min: 0,
      default: 10
    }
  ],
  inputs: [
    {
      key: 'chatId',
      label: '聊天框ID',
      formType: ModuleInputItemTypeEnum.system
    }
  ],
  outputs: [
    {
      key: 'history',
      targets: []
    }
  ]
};

export const OpenAIChatModule: ModuleItemType = {
  moduleId: '',
  avatar: '/imgs/logo.png',
  name: 'GPT 对话',
  description: '',
  url: '/openapi/chat/completion',
  body: [
    {
      key: 'model',
      label: '模型',
      formType: ModuleInputItemTypeEnum.select,
      placeholder: '',
      enum: [
        { label: 'Gpt35-4k', value: 'gpt-3.5-turbo' },
        { label: 'Gpt35-16k', value: 'gpt-3.5-turbo-16k' },
        { label: 'Gpt4', value: 'gpt-4' }
      ]
    },
    {
      key: 'temperature',
      label: '温度',
      formType: ModuleInputItemTypeEnum.slider,
      enum: [
        { label: '严谨', value: 0 },
        { label: '发散', value: 10 }
      ],
      max: 10,
      min: 0
    },
    {
      key: 'maxToken',
      label: '回复上限',
      formType: ModuleInputItemTypeEnum.slider,
      enum: [
        { label: '严谨', value: 0 },
        { label: '发散', value: 10 }
      ],
      max: 10,
      min: 0
    }
  ],
  inputs: [HistoryInputModule, UserInputModule],
  outputs: [
    {
      key: 'history',
      targets: []
    },
    {
      key: 'jsonRes',
      targets: []
    }
  ]
};

/* app */
export enum AppModuleItemTypeEnum {
  'http' = 'http', // send a http request
  'switch' = 'switch', // one input and two outputs
  'answer' = 'answer' // redirect response
}
export enum SystemInputEnum {
  'start' = 'start', // a trigger switch
  'history' = 'history',
  'userChatInput' = 'userChatInput'
}
export enum SpecificInputEnum {
  'answerText' = 'answerText' //  answer module text key
}

export const answerModule = ({ id, defaultText }: { id: string; defaultText?: string }) => ({
  moduleId: id,
  type: AppModuleItemTypeEnum.answer,
  body: {},
  inputs: [
    {
      key: SpecificInputEnum.answerText,
      value: defaultText
    },
    ...(defaultText !== undefined
      ? [
          {
            key: SystemInputEnum.start,
            value: undefined
          }
        ]
      : [])
  ],
  outputs: []
});

export const chatAppDemo: AppItemType = {
  id: 'chat',
  // 标记字段
  modules: [
    {
      moduleId: '1',
      type: AppModuleItemTypeEnum.http,
      url: '/openapi/modules/chat/gpt',
      body: {
        model: 'gpt-3.5-turbo-16k',
        temperature: 5,
        maxToken: 4000
      },
      inputs: [
        {
          key: SystemInputEnum.history,
          value: undefined
        },
        {
          key: SystemInputEnum.userChatInput,
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'answer',
          answer: true,
          value: undefined,
          targets: []
        }
      ]
    }
  ]
};

export const kbChatAppDemo: AppItemType = {
  id: 'kbchat',
  // 标记字段
  modules: [
    {
      moduleId: '1',
      type: 'http',
      url: '/openapi/modules/kb/search',
      body: {
        kb_ids: ['646627f4f7b896cfd8910e38'],
        similarity: 0.82,
        limit: 2,
        maxToken: 2500
      },
      inputs: [
        {
          key: SystemInputEnum.history,
          value: undefined
        },
        {
          key: SystemInputEnum.userChatInput,
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'rawSearch',
          value: undefined,
          targets: []
        },
        {
          key: 'isEmpty',
          value: undefined,
          targets: [
            {
              moduleId: '4',
              key: 'switch'
            }
          ]
        },
        {
          key: 'quotePrompt',
          response: true,
          value: undefined,
          targets: [
            {
              moduleId: '2',
              key: 'quotePrompt'
            }
          ]
        }
      ]
    },
    {
      moduleId: '4',
      type: 'switch',
      body: {},
      inputs: [
        {
          key: 'switch',
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'true',
          value: undefined,
          targets: [
            {
              moduleId: '3',
              key: SystemInputEnum.start
            }
          ]
        },
        {
          key: 'false',
          value: undefined,
          targets: [
            {
              moduleId: '2',
              key: SystemInputEnum.start
            }
          ]
        }
      ]
    },
    {
      moduleId: '2',
      type: 'http',
      url: '/openapi/modules/chat/gpt',
      body: {
        model: 'gpt-3.5-turbo-16k',
        temperature: 5,
        maxToken: 4000,
        systemPrompt: '知识库是关于电影玲芽之旅的介绍。',
        limitPrompt: '你仅回答关于电影《玲芽之旅的问题》'
      },
      inputs: [
        {
          key: SystemInputEnum.start,
          value: undefined
        },
        {
          key: 'quotePrompt',
          value: undefined
        },
        {
          key: SystemInputEnum.history,
          value: undefined
        },
        {
          key: SystemInputEnum.userChatInput,
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'answer',
          value: undefined,
          answer: true,
          targets: []
        }
      ]
    },
    answerModule({ id: '3', defaultText: '你好，我可以回答你关于电影《玲芽之旅》的问题。' })
  ]
};

export const classifyQuestionDemo: AppItemType = {
  id: 'classifyQuestionDemo',
  // 标记字段
  modules: [
    {
      moduleId: '1',
      type: AppModuleItemTypeEnum.http,
      url: '/openapi/modules/agent/classifyQuestion',
      body: {
        systemPrompt:
          'laf 一个云函数开发平台，提供了基于 Node 的 serveless 的快速开发和部署。是一个集「函数计算」、「数据库」、「对象存储」等于一身的一站式开发平台。支持云函数、云数据库、在线编程 IDE、触发器、云存储和静态网站托管等功能。',
        agents: [
          {
            desc: '打招呼、问候、身份询问等问题',
            key: 'a'
          },
          {
            desc: "询问 'laf 使用和介绍的问题'",
            key: 'b'
          },
          {
            desc: "询问 'laf 代码问题'",
            key: 'c'
          },
          {
            desc: '其他问题',
            key: 'd'
          }
        ]
      },
      inputs: [
        {
          key: SystemInputEnum.history,
          value: undefined
        },
        {
          key: SystemInputEnum.userChatInput,
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'a',
          value: undefined,
          targets: [
            {
              moduleId: 'a',
              key: SystemInputEnum.start
            }
          ]
        },
        {
          key: 'b',
          value: undefined,
          targets: [
            {
              moduleId: 'b',
              key: SystemInputEnum.start
            }
          ]
        },
        {
          key: 'c',
          value: undefined,
          targets: [
            {
              moduleId: 'c',
              key: SystemInputEnum.start
            }
          ]
        },
        {
          key: 'd',
          value: undefined,
          targets: [
            {
              moduleId: 'd',
              key: SystemInputEnum.start
            }
          ]
        }
      ]
    },
    {
      moduleId: 'a',
      type: 'answer',
      body: {},
      inputs: [
        {
          key: SpecificInputEnum.answerText,
          value: '你好，我是 Laf 助手，有什么可以帮助你的？'
        },
        {
          key: SystemInputEnum.start,
          value: undefined
        }
      ],
      outputs: []
    },
    // laf 知识库
    {
      moduleId: 'b',
      type: 'http',
      url: '/openapi/modules/kb/search',
      body: {
        kb_ids: ['646627f4f7b896cfd8910e24'],
        similarity: 0.82,
        limit: 4,
        maxToken: 2500
      },
      inputs: [
        {
          key: SystemInputEnum.start,
          value: undefined
        },
        {
          key: SystemInputEnum.history,
          value: undefined
        },
        {
          key: SystemInputEnum.userChatInput,
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'rawSearch',
          value: undefined,
          response: true,
          targets: []
        },
        {
          key: 'quotePrompt',
          value: undefined,
          targets: [
            {
              moduleId: 'lafchat',
              key: 'quotePrompt'
            }
          ]
        }
      ]
    },
    // laf 对话
    {
      moduleId: 'lafchat',
      type: 'http',
      url: '/openapi/modules/chat/gpt',
      body: {
        model: 'gpt-3.5-turbo-16k',
        temperature: 5,
        maxToken: 4000,
        systemPrompt: '知识库是关于 Laf 的内容。',
        limitPrompt: '你仅能参考知识库的内容回答问题，不能超出知识库范围。'
      },
      inputs: [
        {
          key: 'quotePrompt',
          value: undefined
        },
        {
          key: SystemInputEnum.history,
          value: undefined
        },
        {
          key: SystemInputEnum.userChatInput,
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'answer',
          answer: true,
          value: undefined,
          targets: []
        }
      ]
    },
    // laf 代码知识库
    {
      moduleId: 'c',
      type: 'http',
      url: '/openapi/modules/kb/search',
      body: {
        kb_ids: ['646627f4f7b896cfd8910e26'],
        similarity: 0.8,
        limit: 4,
        maxToken: 2500
      },
      inputs: [
        {
          key: SystemInputEnum.start,
          value: undefined
        },
        {
          key: SystemInputEnum.history,
          value: undefined
        },
        {
          key: SystemInputEnum.userChatInput,
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'rawSearch',
          value: undefined,
          response: true,
          targets: []
        },
        {
          key: 'quotePrompt',
          value: undefined,
          targets: [
            {
              moduleId: 'lafcodechat',
              key: 'quotePrompt'
            }
          ]
        }
      ]
    },
    // laf代码对话
    {
      moduleId: 'lafcodechat',
      type: 'http',
      url: '/openapi/modules/chat/gpt',
      body: {
        model: 'gpt-3.5-turbo-16k',
        temperature: 5,
        maxToken: 4000,
        systemPrompt: `下例是laf结构\n~~~ts\nimport cloud from '@lafjs/cloud'\nexport default async function(ctx: FunctionContext){\nreturn  \"success\"\n};\n~~~\n下例是@lafjs/cloud的api\n~~~\ncloud.fetch//完全等同axios\ncloud.database()// 获取操作数据库实例,和mongo语法相似.\ncloud.getToken(payload)//获取token\ncloud.parseToken(token)//解析token\n// 下面是持久化缓存Api\ncloud.shared.set(key,val); //设置缓存,仅能设置值,无法设置过期时间\ncloud.shared.get(key);\ncloud.shared.has(key); \ncloud.shared.delete(key); \ncloud.shared.clear(); \n~~~\n下例是ctx对象\n~~~\nctx.requestId\nctx.method\nctx.headers//请求的 headers, ctx.headers.get('Content-Type')获取Content-Type的值\nctx.user//Http Bearer Token 认证时,获取token值\nctx.query\nctx.body\nctx.request//同express的Request\nctx.response//同express的Response\nctx.socket/WebSocket 实例\nctx.files//上传的文件 (File对象数组)\nctx.env//自定义的环境变量\n~~~\n下例是数据库获取数据\n~~~ts\nconst db = cloud.database();\nexport default async function(ctx: FunctionContext){\nconst {minMemory} = ctx.query\nconst _ = db.command;\nconst {data: users,total} = collection(\"users\")\n  .where({//条件查询\n    category:  \"computer\",\n    type: {\n      memory: _gt(minMemory), \n    }\n  }) \n  .skip(10)//跳过10条-分页时使用\n  .limit(10)//仅返回10条\n  .orderBy(\"name\", \"asc\") \n  .orderBy(\"age\", \"desc\")\n  .field({age:true,name: false})//返回age不返回name\n}\nconst {data:user} = db.where({phone:req.body.phone}).getOne()//获取一个满足条件的用户\nreturn {users,total}\n~~~\n下例是数据库添加数据\n~~~ts\nconst db = cloud.database();\nexport default async function(ctx: FunctionContext) {\n  const {username} = ctx.body\n  const {id:userId, ok} = await collection(\"users\")\n    .add({\n      username, \n    })\n  if(ok) return {userId}\n  return {code:500,message:\"失败\"}\n}\n~~~\n下例是数据库更新数据\n~~~ts\nconst db = cloud.database();\nexport default async function(ctx: FunctionContext){\nconst {id} = req.query\n//id直接修改\nawait collection(\"user\").doc(\"id\").update({\n  name: \"Hey\",\n});\n//批量更新\nawait collection\n  .where({name:\"1234\"})\n  .update({\n    age:18\n  })\nconst _ = db.command;\nawait collection(\"user\")\n  .doc(id)\n  .set({\n    count: _.inc(1)\n    count: _.mul(2)\n    count: _.remove()\n    users: _.push([\"aaa\", \"bbb\"])\n    users: _.push(\"aaa\")\n    users: _.pop()\n    users: _.unshift()\n    users: _.shift()\n  })\n}\n~~~\n下例是删除数据库记录\n~~~ts\nconst db = cloud.database();\nexport default async function(ctx: FunctionContext){\nconst {id} = req.query\ncollection(\"user\").doc(id).remove();\n//批量删除\ncollection\n  .where({age:18}) \n  .remove({multi: true})\nreturn \"success\"\n}\n~~~\n你只需返回 ts 代码块!不需要说明.\n用户的问题与 Laf 代码无关时，你直接回答: \"我不确定，我只会写 Laf 代码。\"`,
        limitPrompt:
          '你是由 Laf 团队开发的代码助手,把我的需求用 Laf 代码实现.参考知识库中 Laf 的例子.'
      },
      inputs: [
        {
          key: 'quotePrompt',
          value: undefined
        },
        {
          key: SystemInputEnum.history,
          value: undefined
        },
        {
          key: SystemInputEnum.userChatInput,
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'answer',
          answer: true,
          value: undefined,
          targets: []
        }
      ]
    },
    {
      moduleId: 'd',
      type: 'answer',
      body: {},
      inputs: [
        {
          key: SpecificInputEnum.answerText,
          value: '你好，我没有理解你的意思，请问你有什么 Laf 相关的问题么？'
        },
        {
          key: SystemInputEnum.start,
          value: undefined
        }
      ],
      outputs: []
    }
  ]
};

export const lafClassifyQuestionDemo: AppItemType = {
  id: 'test',
  // 标记字段
  modules: [
    {
      moduleId: '1',
      type: AppModuleItemTypeEnum.http,
      url: '/openapi/modules/agent/classifyQuestion',
      body: {
        systemPrompt:
          'laf 一个云函数开发平台，提供了基于 Node 的 serveless 的快速开发和部署。是一个集「函数计算」、「数据库」、「对象存储」等于一身的一站式开发平台。支持云函数、云数据库、在线编程 IDE、触发器、云存储和静态网站托管等功能。\nsealos是一个 k8s 云平台，可以让用户快速部署云服务。',
        agents: [
          {
            desc: '打招呼、问候、身份询问等问题',
            key: 'a'
          },
          {
            desc: "询问 'laf 的使用和介绍'",
            key: 'b'
          },
          {
            desc: "询问 'laf 代码相关问题'",
            key: 'c'
          },
          {
            desc: "用户希望运行或知道 'laf 代码' 运行结果",
            key: 'g'
          },
          {
            desc: "询问 'sealos 相关问题'",
            key: 'd'
          },
          {
            desc: '其他问题',
            key: 'e'
          },
          {
            desc: '商务类问题',
            key: 'f'
          }
        ]
      },
      inputs: [
        {
          key: SystemInputEnum.history,
          value: undefined
        },
        {
          key: SystemInputEnum.userChatInput,
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'a',
          value: undefined,
          targets: [
            {
              moduleId: 'a',
              key: SystemInputEnum.start
            }
          ]
        },
        {
          key: 'b',
          value: undefined,
          targets: [
            {
              moduleId: 'b',
              key: SystemInputEnum.start
            }
          ]
        },
        {
          key: 'c',
          value: undefined,
          targets: [
            {
              moduleId: 'c',
              key: SystemInputEnum.start
            }
          ]
        },
        {
          key: 'd',
          value: undefined,
          targets: [
            {
              moduleId: 'd',
              key: SystemInputEnum.start
            }
          ]
        },
        {
          key: 'e',
          value: undefined,
          targets: [
            {
              moduleId: 'e',
              key: SystemInputEnum.start
            }
          ]
        },
        {
          key: 'f',
          value: undefined,
          targets: [
            {
              moduleId: 'f',
              key: SystemInputEnum.start
            }
          ]
        },
        {
          key: 'g',
          value: undefined,
          targets: [
            {
              moduleId: 'g',
              key: SystemInputEnum.start
            }
          ]
        }
      ]
    },
    {
      moduleId: 'a',
      type: 'answer',
      body: {},
      inputs: [
        {
          key: SpecificInputEnum.answerText,
          value: '你好，我是 环界云 助手，你有什么 Laf 或者 sealos 的 问题么？'
        },
        {
          key: SystemInputEnum.start,
          value: undefined
        }
      ],
      outputs: []
    },
    {
      moduleId: 'b',
      type: 'answer',
      body: {},
      inputs: [
        {
          key: SpecificInputEnum.answerText,
          value: '查询 Laf 通用知识库：xxxxx'
        },
        {
          key: SystemInputEnum.start,
          value: undefined
        }
      ],
      outputs: []
    },
    {
      moduleId: 'c',
      type: 'answer',
      body: {},
      inputs: [
        {
          key: SpecificInputEnum.answerText,
          value: '查询 Laf 代码知识库：xxxxx'
        },
        {
          key: SystemInputEnum.start,
          value: undefined
        }
      ],
      outputs: []
    },
    {
      moduleId: 'd',
      type: 'answer',
      body: {},
      inputs: [
        {
          key: SpecificInputEnum.answerText,
          value: '查询 sealos 通用知识库: xxxx'
        },
        {
          key: SystemInputEnum.start,
          value: undefined
        }
      ],
      outputs: []
    },
    {
      moduleId: 'e',
      type: 'answer',
      body: {},
      inputs: [
        {
          key: SpecificInputEnum.answerText,
          value: '其他问题。回复引导语：xxxx'
        },
        {
          key: SystemInputEnum.start,
          value: undefined
        }
      ],
      outputs: []
    },
    {
      moduleId: 'f',
      type: 'answer',
      body: {},
      inputs: [
        {
          key: SpecificInputEnum.answerText,
          value: '商务类问题，联系方式：xxxxx'
        },
        {
          key: SystemInputEnum.start,
          value: undefined
        }
      ],
      outputs: []
    },
    {
      moduleId: 'g',
      type: 'http',
      url: '/openapi/modules/agent/extract',
      body: {
        description: '运行 laf 代码',
        agents: [
          {
            desc: '代码内容',
            key: 'code'
          }
        ]
      },
      inputs: [
        {
          key: SystemInputEnum.start,
          value: undefined
        },
        {
          key: SystemInputEnum.history,
          value: undefined
        },
        {
          key: SystemInputEnum.userChatInput,
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'code',
          value: undefined,
          targets: [
            {
              moduleId: 'code_run',
              key: 'code'
            }
          ]
        }
      ]
    },
    {
      moduleId: 'code_run',
      type: AppModuleItemTypeEnum.http,
      url: 'https://v1cde7.laf.run/tess',
      body: {},
      inputs: [
        {
          key: 'code',
          value: undefined
        }
      ],
      outputs: [
        {
          key: 'star',
          value: undefined,
          targets: []
        }
      ]
    }
  ]
};
