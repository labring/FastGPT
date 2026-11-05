# 工程与类型

适用于前后端的模块、依赖、TypeScript、API/schema 和 i18n 改动。目录、固定文件、代码形式和 Zod/OpenAPI 细则以 [代码规范](../../../../code/syntax.md) 为准，此处聚焦审查时需要追踪的边界与使用方。

## 模块与依赖

- 按业务域组织代码，核实 schema、entity、service、纯工具及上层协调职责，避免把业务规则混入数据访问或 UI/API 胶水代码。
- `service`、`web` 依赖 `global`；前端不能引入服务端模块，`global/core` 不引入 mongoose 或服务端 SDK。`projects/app` 的服务端可使用全部 packages，不能据此放宽客户端边界；sandbox、mcp_server 等独立项目避免引入无关依赖。
- 跨包使用 `@fastgpt/*` 别名，直接从成员定义文件导入，禁止 barrel 和 `export ... from` 转导；移动定义时核对全部使用方，不留下转发层。
- 同级或跨业务域 Service 的协调由上层完成，通过参数传入数据或所需能力，避免直接互相 import、循环依赖或反向引用上层。不能只因文件名含 service/controller 就判错，需核实真实职责和依赖方向。
- 公共逻辑按业务归属和复用需求决定放置位置；仅通用基础能力适合下沉 common，不要求所有被多个 Service 使用的业务逻辑都搬到 common。
- 数据写操作应支持上层组合事务，检查可选 session 的透传与 `mongoSessionRun` 使用；数据库执行与失败风险分别见 [数据与性能](data-performance.md) 和 [错误与日志](errors-logging.md)。

## 接口与类型契约

- Props、函数参数、返回值及公共结构应有有效类型约束，检查 any、过宽 object/{}、双重断言或无根据的 as 是否绕过真实约束。未知外部数据优先用 unknown，通过 schema 或类型守卫收窄。
- 非空断言需有上游校验或明确不变量支撑；追踪到实际保证点，不能仅凭注释认定非空。
- 类型声明、超过两个参数时使用对象、Zod 的 z.infer 复用等统一对照代码规范，不在前后端分别维护同一规则。
- API 边界有实际入参时，使用 `parseApiInput` 校验 req.body/query/params；内部业务数据、数据库记录及模型/工具输出仍使用普通 Schema.parse 或适当的运行时校验。不能因为类型已有声明或某层已校验，就省略新的信任边界所需校验，也不要求可信内部数据每层重复解析。
- 业务通用 schema 放在所属业务域，`packages/global/openapi` 仅声明接口专用契约并复用业务 schema；按客户端实际传参核对兼容解析、字段元信息及响应结构，具体约定见代码规范。
- 请求无入参或成功响应无业务数据时，不为形式完整新增空 Schema。请求校验错误的处理边界见 [Zod 请求入参错误处理设计](../../../../design/api/zod-request-parse-error-handling.md)。

## 国际化

- 用户可见文本使用 t，服务端使用 i18nT；key 使用命名空间，动态文本通过插值传参，并检查对应语言包完整。
- 调用处必须保留静态字面量 key，例如 `t('ns:literal_key')`；不要使用 ``t(`ns:key_${value}`)``、`t(prefix + value)`、`t(variableKey)` 或 `t(condition ? 'ns:a' : 'ns:b')`，避免清理脚本误删和运行时裸显 key。
- 有限枚举通过显式分支或静态映射组织，但最终翻译调用仍须使用字面量 key；不能仅把动态 key 挪进变量就视为可静态识别。
