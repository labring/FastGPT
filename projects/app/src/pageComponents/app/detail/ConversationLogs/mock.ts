/**
 * @file 优化记录 Mock 数据服务
 * @description 模拟 API 接口,便于后续联调时快速替换为真实接口
 */
import type { ChatCorrectionSchemaType, GetKeywordQuoteResponse, CorrectedQuoteItem } from './type';
import { CorrectionModeEnum } from './type';

/**
 * 获取关键词引用的请求参数类型
 */
export interface GetKeywordQuoteParams {
  keyword: string;
  offset: number;
  pageSize: number;
}
// 模拟数据
const mockData: ChatCorrectionSchemaType[] = [
  {
    _id: '2',
    dataId: 'data2',
    teamId: 'team1',
    tmbId: 'tmb2',
    userId: 'user2',
    userName: '李四',
    chatId: 'chat1',
    appId: 'app1',
    correctionData: {
      correctionMode: CorrectionModeEnum.annotate,
      question: '如何申请退款',
      rawAnswer: '请联系客服申请退款',
      correctedQuoteList: [
        {
          datasetDataId: 'quote1',
          q: '退款申请流程',
          a: '用户可以通过APP内的退款申请页面提交退款申请，我们会在3个工作日内处理您的申请。',
          sourceName: '退款政策文档.pdf'
        },
        {
          datasetDataId: 'quote2',
          q: '退款到账时间',
          a: '退款处理完成后，资金将在1-3个工作日内原路退回到您的支付账户。',
          sourceName: '客服手册.docx'
        }
      ]
    },
    createTime: new Date('2024-12-05T10:30:00'),
    updateTime: new Date('2024-12-05T10:30:00')
  },
  {
    _id: '1',
    dataId: 'data1',
    teamId: 'team1',
    tmbId: 'tmb1',
    userId: 'user1',
    userName: '张三',
    chatId: 'chat1',
    appId: 'app1',
    correctionData: {
      correctionMode: CorrectionModeEnum.edit,
      question: '用户咨询产品价格',
      rawAnswer: '产品价格是100元',
      correctedAnswer:
        '我们的产品价格为100元，包含一年质保服务，如果您有批量采购需求，还可以享受优惠价格。我们的产品价格为100元，包含一年质保服务，如果您有批量采购需求，还可以享受优惠价格。我们的产品价格为100元，包含一年质保服务，如果您有批量采购需求，还可以享受优惠价格。我们的产品价格为100元，包含一年质保服务，如果您有批量采购需求，还可以享受优惠价格。我们的产品价格为100元，包含一年质保服务，如果您有批量采购需求，还可以享受优惠价格。我们的产品价格为100元，包含一年质保服务，如果您有批量采购需求，还可以享受优惠价格。我们的产品价格为100元，包含一年质保服务，如果您有批量采购需求，还可以享受优惠价格。我们的产品价格为100元，包含一年质保服务，如果您有批量采购需求，还可以享受优惠价格。我们的产品价格为100元，包含一年质保服务，如果您有批量采购需求，还可以享受优惠价格。'
    },
    createTime: new Date('2024-12-10T15:17:08'),
    updateTime: new Date('2024-12-10T15:17:08')
  },
  {
    _id: '3',
    dataId: 'data3',
    teamId: 'team1',
    tmbId: 'tmb3',
    userId: 'user3',
    userName: '王五',
    chatId: 'chat1',
    appId: 'app1',
    correctionData: {
      correctionMode: CorrectionModeEnum.edit,
      question:
        '请问你们公司的AI智能客服系统具体有哪些功能模块？能否详细介绍每个模块的作用和使用场景？另外，这个系统的技术架构是怎样的？是否支持多语言？数据安全性如何保障？部署方式有哪些选择？后面的文本是为了测试超长文本是否存在溢出省略加的，请忽略！！~~',
      rawAnswer: '我们有AI客服系统',
      correctedAnswer:
        '我们的AI智能客服系统是一个功能全面的企业级解决方案，主要包含以下核心功能模块：1）智能问答模块：基于自然语言处理技术，能够理解用户意图并提供准确回答，支持多轮对话和上下文理解；2）知识库管理模块：提供完善的知识库建设和管理功能，支持多种文档格式导入，智能分类和标签管理；3）工单系统模块：当AI无法解决问题时，自动转接人工客服，创建工单并跟踪处理进度；4）数据分析模块：提供详细的对话数据分析、用户行为分析、服务质量监控等报表功能；5）多渠道接入模块：支持网站、APP、微信、钉钉等多种接入方式；6）个性化配置模块：支持自定义对话流程、回复模板、机器人形象等。技术架构方面，我们采用微服务架构，使用容器化部署，支持水平扩展。系统支持中文、英文、日文等多种语言，数据传输采用SSL加密，存储采用AES-256加密，符合GDPR等数据保护法规。部署方式支持公有云、私有云和本地化部署，能够满足不同企业的安全合规要求。'
    },
    createTime: new Date('2024-12-15T09:25:30'),
    updateTime: new Date('2024-12-15T09:25:30')
  },
  {
    _id: '4',
    dataId: 'data4',
    teamId: 'team1',
    tmbId: 'tmb4',
    userId: 'user4',
    userName: '赵六',
    chatId: 'chat1',
    appId: 'app1',
    correctionData: {
      correctionMode: CorrectionModeEnum.annotate,
      question:
        '我想了解你们企业级SaaS平台的完整解决方案，包括产品功能、技术架构、部署方式、数据安全、价格体系、售后服务等各个方面的详细信息，特别是针对大型企业的定制化能力和扩展性如何？',
      rawAnswer: '我们有企业级解决方案',
      correctedQuoteList: [
        {
          datasetDataId: 'quote3',
          q: '产品功能模块详细介绍',
          a: '我们的企业级SaaS平台提供完整的一站式解决方案，包含核心业务管理、客户关系管理、人力资源管理、财务管理、供应链管理、项目管理、数据分析与商业智能等八大核心模块。每个模块都经过精心设计，能够满足大型企业复杂的业务需求。核心业务管理模块支持多组织架构、多币种、多语言，能够处理跨国业务；客户关系管理模块提供全生命周期的客户管理，从线索获取到售后服务的完整闭环；人力资源管理模块涵盖招聘、培训、绩效、薪酬等全流程；财务管理模块支持多账套、多会计准则，能够满足上市公司的合规要求。',
          sourceName: '企业级SaaS平台产品白皮书_v3.2.pdf'
        },
        {
          datasetDataId: 'quote4',
          q: '技术架构与部署方案',
          a: '平台采用云原生微服务架构，基于Kubernetes容器编排，支持自动扩缩容和故障自愈。技术栈包括Spring Cloud微服务框架、React前端框架、PostgreSQL数据库、Redis缓存、Elasticsearch搜索引擎、RabbitMQ消息队列等。部署方式支持公有云（AWS、Azure、阿里云、腾讯云）、私有云、混合云和本地化部署。我们提供完善的DevOps工具链，支持CI/CD自动化部署，蓝绿发布、灰度发布等多种发布策略。系统具备高可用性设计，支持多活部署，RTO<5分钟，RPO<1分钟，能够满足金融级业务连续性要求。',
          sourceName: '技术架构设计文档_2024版.docx'
        },
        {
          datasetDataId: 'quote5',
          q: '数据安全与合规保障',
          a: '数据安全是我们的核心关注点，我们采用多层次的安全防护体系。网络层面使用DDoS防护、WAF防火墙、VPN加密通道；应用层面实现RBAC权限控制、API网关鉴权、操作审计日志；数据层面采用AES-256加密存储、字段级脱敏、数据备份与恢复；基础设施层面通过ISO27001、SOC2、等保三级等安全认证。我们支持GDPR、CCPA、网络安全法等国内外数据保护法规，提供数据本地化存储选项，确保企业数据主权。所有数据处理过程都有完整的审计追踪，支持数据血缘分析和合规报告生成。',
          sourceName: '数据安全与合规指南_最新版.pdf'
        },
        {
          datasetDataId: 'quote6',
          q: '数据安全与合规保障',
          a: '数据安全是我们的核心关注点，我们采用多层次的安全防护体系。网络层面使用DDoS防护、WAF防火墙、VPN加密通道；应用层面实现RBAC权限控制、API网关鉴权、操作审计日志；数据层面采用AES-256加密存储、字段级脱敏、数据备份与恢复；基础设施层面通过ISO27001、SOC2、等保三级等安全认证。我们支持GDPR、CCPA、网络安全法等国内外数据保护法规，提供数据本地化存储选项，确保企业数据主权。所有数据处理过程都有完整的审计追踪，支持数据血缘分析和合规报告生成。',
          sourceName: '数据安全与合规指南_最新版.pdf'
        },
        {
          datasetDataId: 'quote7',
          q: '数据安全与合规保障',
          a: '数据安全是我们的核心关注点，我们采用多层次的安全防护体系。网络层面使用DDoS防护、WAF防火墙、VPN加密通道；应用层面实现RBAC权限控制、API网关鉴权、操作审计日志；数据层面采用AES-256加密存储、字段级脱敏、数据备份与恢复；基础设施层面通过ISO27001、SOC2、等保三级等安全认证。我们支持GDPR、CCPA、网络安全法等国内外数据保护法规，提供数据本地化存储选项，确保企业数据主权。所有数据处理过程都有完整的审计追踪，支持数据血缘分析和合规报告生成。',
          sourceName: '数据安全与合规指南_最新版.pdf'
        }
      ]
    },
    createTime: new Date('2024-12-18T14:45:20'),
    updateTime: new Date('2024-12-18T14:45:20')
  }
];

/**
 * 获取优化记录列表的请求参数类型
 */
export interface GetOptimizeRecordsParams {
  appId: string;
  chatId?: string;
  startTime: Date;
  endTime: Date;
  page?: number;
  pageSize?: number;
}

/**
 * 获取优化记录列表的响应类型
 */
export interface GetOptimizeRecordsResponse {
  data: ChatCorrectionSchemaType[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 删除优化记录的请求参数类型
 */
export interface DeleteOptimizeRecordParams {
  recordId: string;
  appId: string;
}

/**
 * Mock API 服务类
 */
class MockOptimizeRecordsService {
  /**
   * 获取优化记录列表
   * @param params 请求参数
   * @returns 优化记录列表
   */
  async getOptimizeRecords(params: GetOptimizeRecordsParams): Promise<GetOptimizeRecordsResponse> {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, 800));

    // 直接返回全量 mock 数据，不进行任何过滤
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = mockData.slice(startIndex, endIndex);

    return {
      data: paginatedData,
      total: mockData.length,
      page,
      pageSize
    };
  }

  /**
   * 删除优化记录
   * @param params 删除参数
   * @returns 删除结果
   */
  async deleteOptimizeRecord(params: DeleteOptimizeRecordParams): Promise<{ success: boolean }> {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 在实际应用中，这里会调用真实的删除 API
    // 目前只是模拟删除成功
    console.log(`删除记录: ${params.recordId} from app: ${params.appId}`);

    return { success: true };
  }

  /**
   * 更新优化记录
   * @param recordId 记录ID
   * @param data 更新数据
   * @returns 更新结果
   */
  async updateOptimizeRecord(
    recordId: string,
    data: Partial<ChatCorrectionSchemaType>
  ): Promise<{ success: boolean; data?: ChatCorrectionSchemaType }> {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, 600));

    // 在实际应用中，这里会调用真实的更新 API
    console.log(`更新记录: ${recordId}`, data);

    return { success: true };
  }

  /**
   * 根据关键词搜索知识引用
   * @param params 搜索参数
   * @returns 搜索结果
   */
  async getKeywordQuote(params: GetKeywordQuoteParams): Promise<GetKeywordQuoteResponse> {
    // 模拟网络延迟
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 从 mock 数据中提取所有的引用项
    const allQuotes: CorrectedQuoteItem[] = [];
    mockData.forEach((record) => {
      if (record.correctionData.correctedQuoteList) {
        allQuotes.push(...record.correctionData.correctedQuoteList);
      }
    });

    // 根据关键词过滤
    let filteredQuotes = allQuotes;
    if (params.keyword) {
      const keyword = params.keyword.toLowerCase();
      filteredQuotes = allQuotes.filter(
        (quote) =>
          quote.q.toLowerCase().includes(keyword) ||
          (quote.a && quote.a.toLowerCase().includes(keyword)) ||
          quote.sourceName.toLowerCase().includes(keyword)
      );
    }

    // 分页处理
    const startIndex = params.offset;
    const endIndex = startIndex + params.pageSize;
    const paginatedQuotes = filteredQuotes.slice(startIndex, endIndex);

    // 转换为响应格式
    const list = paginatedQuotes.map((quote) => ({
      datasetDataId: quote.datasetDataId,
      q: quote.q,
      a: quote.a,
      sourceName: quote.sourceName
    }));

    return {
      list,
      total: filteredQuotes.length
    };
  }
}

// 导出单例实例
export const optimizeRecordsService = new MockOptimizeRecordsService();

// 导出类型
export type { ChatCorrectionSchemaType };
