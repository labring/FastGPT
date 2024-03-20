import { init as initApm } from '@elastic/apm-rum';

const appName = 'fastgpt';
// const serverUrl = process.env.NEXT_PUBLIC_ELASTIC_APM_SERVER_URL

// register apm-agent
export const apm = initApm({
  serviceName: appName,
  serverUrl: '/api/proxy/apm',
  serviceVersion: '1.0.0',
  active: true, // 代理是否应该处于活动状态
  instrument: true, //  代理是否自动检测应用程序
  disableInstrumentations: [], // 禁用类型page-load，history、eventtarget、xmlhttprequest、fetch、error
  environment: 'dev', // 部署被监控服务的环境，例如“生产”、“开发”、“测试”等
  logLevel: 'warn', // 代理的详细级别, 例如 trace, debug, info, warn, error
  breakdownMetrics: false, // 启用/禁用事务细分指标的跟踪和收集
  flushInterval: 500, // 代理维护两个内存队列，以在添加事务和错误时记录它们。此选项设置这些队列的刷新间隔（以毫秒为单位）
  pageLoadTraceId: '', // 覆盖页面加载事务的跟踪 ID
  pageLoadSpanId: '', // 覆盖为接收初始文档而生成的 span 的 ID
  pageLoadTransactionName: '', // 设置页面加载事务的名称
  distributedTracing: true, // 启用分布式跟踪
  distributedTracingOrigins: [], // 哪些来源应作为分布式跟踪的一部分进行监控
  // errorThrottleLimit: 200, // 限制发送到 APM 服务器的错误数量
  // errorThrottleInterval: 30000, // 代理只能每毫秒发送（最多）20错误。30000
  // transactionThrottleLimit: 20, // 交易事务数量限制
  // transactionThrottleInterval: 30000, // 代理只能每毫秒发送（最多）20事务。30000
  transactionSampleRate: 1, // 事务采样率
  centralConfig: false, // 通过 Kibana 激活 APM 代理配置
  ignoreTransactions: [/.*\/intake\/v2\/rum\/events/] // 设置规则发送，支持正则
});
