import { i18nT } from '../../../../web/i18n/utils';
import { SkillCategoryEnum, type SkillManifestType } from './type';

export const SkillCategoryMap: Record<SkillCategoryEnum, { label: string }> = {
  [SkillCategoryEnum.writing]: { label: i18nT('app:skill_category_writing') },
  [SkillCategoryEnum.coding]: { label: i18nT('app:skill_category_coding') },
  [SkillCategoryEnum.research]: { label: i18nT('app:skill_category_research') },
  [SkillCategoryEnum.customerService]: { label: i18nT('app:skill_category_customer_service') },
  [SkillCategoryEnum.dataAnalysis]: { label: i18nT('app:skill_category_data_analysis') }
};

// Built-in skill templates
export const builtInSkillTemplates: SkillManifestType[] = [
  {
    id: 'skill-coding-assistant',
    name: i18nT('app:skill_coding_assistant_name'),
    description: i18nT('app:skill_coding_assistant_desc'),
    avatar: 'core/app/type/agentFill',
    author: 'FastGPT',
    version: '1.0.0',
    tags: ['coding', 'development'],
    category: SkillCategoryEnum.coding,
    config: {
      systemPrompt:
        'You are an expert coding assistant. Help users write, debug, and optimize code. Always explain your reasoning and provide clean, well-documented code examples. Support multiple programming languages.',
      tools: [],
      variables: [
        {
          key: 'language',
          label: 'Programming Language',
          type: 'select',
          required: false,
          defaultValue: 'TypeScript',
          options: ['TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++'],
          description: 'Preferred programming language'
        }
      ]
    }
  },
  {
    id: 'skill-doc-qa',
    name: i18nT('app:skill_doc_qa_name'),
    description: i18nT('app:skill_doc_qa_desc'),
    avatar: 'core/app/type/workflowFill',
    author: 'FastGPT',
    version: '1.0.0',
    tags: ['research', 'knowledge-base'],
    category: SkillCategoryEnum.research,
    config: {
      systemPrompt:
        'You are a document Q&A assistant. Answer user questions based on the provided knowledge base content. Always cite sources when possible. If the answer is not found in the knowledge base, clearly state that.',
      tools: [],
      variables: [],
      datasetIds: []
    }
  },
  {
    id: 'skill-customer-service',
    name: i18nT('app:skill_customer_service_name'),
    description: i18nT('app:skill_customer_service_desc'),
    avatar: 'core/app/type/simple',
    author: 'FastGPT',
    version: '1.0.0',
    tags: ['customer-service', 'support'],
    category: SkillCategoryEnum.customerService,
    config: {
      systemPrompt:
        'You are a professional customer service agent. Be polite, patient, and helpful. Follow these guidelines:\n1. Greet the customer warmly\n2. Understand their issue clearly before responding\n3. Provide accurate and concise solutions\n4. Escalate complex issues when needed\n5. Always end with asking if there is anything else you can help with',
      tools: [],
      variables: [
        {
          key: 'companyName',
          label: 'Company Name',
          type: 'input',
          required: true,
          description: 'Your company name for personalized responses'
        },
        {
          key: 'businessScope',
          label: 'Business Scope',
          type: 'textarea',
          required: false,
          description: 'Brief description of your business for context'
        }
      ]
    }
  }
];

export const getSkillTemplateById = (id: string): SkillManifestType | undefined => {
  return builtInSkillTemplates.find((skill) => skill.id === id);
};
