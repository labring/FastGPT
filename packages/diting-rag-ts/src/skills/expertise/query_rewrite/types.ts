// src/skills/expertise/query_rewrite/types.ts
// Query Rewrite 类型定义

/**
 * 策略规范 - 可从 YAML 加载
 */
export interface RewriteStrategySpec {
  name: string;
  display_name: string;
  description: string;
  prompt_template: string;
  applicable_when: string;
  examples: Array<{ input: string; output: string }>;
  priority: number;
  exclusive_group: string;
  enabled: boolean;
  parallel_search: boolean;
}

/**
 * 策略选择结果
 */
export interface StrategySelection {
  strategies: string[];
  reasoning: string;
}

/**
 * 重写结果
 */
export interface RewriteResult {
  queries: string[];
  strategy: string;
}

/**
 * 默认策略规范（6种）
 */
export const DEFAULT_STRATEGIES: RewriteStrategySpec[] = [
  {
    name: 'cce',
    display_name: 'Core Content Extraction',
    description:
      'Extract the core question from a query that contains excessive background information',
    applicable_when:
      'Query is too long, with the core question buried under extensive background description',
    prompt_template:
      'Extract the core question from the following verbose query, removing unnecessary background description:\nQuery: {query}',
    examples: [
      {
        input:
          'Our company recently started evaluating system upgrades. We need to know whether the load balancer supports session persistence so that users logging into the application are not redirected to different backend servers',
        output: 'load balancer session persistence configuration'
      }
    ],
    priority: 10,
    exclusive_group: 'extraction',
    enabled: true,
    parallel_search: true
  },
  {
    name: 'decompose',
    display_name: 'Query Decomposition',
    description:
      'Decompose a compound query into multiple sub-queries with dependency analysis. Supports parallel/sequential execution marking and comparison dimension discovery.',
    applicable_when:
      'Query involves multiple aspects, requires comparing multiple objects, or has chain dependencies',
    prompt_template: `Decompose the following compound query into sub-queries. Analyze dependencies between sub-queries.

  Query: {query}

  Instructions:
  - Identify independent sub-queries that can be searched in parallel
  - Identify dependent sub-queries where one depends on results from another
  - Group sub-queries into steps; assign parallel=true for independent groups
  - Use depends_on to indicate which step a group depends on
  - Add a brief note explaining each step's purpose

  **IMPORTANT for comparison queries**:
  - If the query asks for comparison (e.g., "A和B的区别", "A vs B"), also identify:
    - compare_objects: list of objects being compared (e.g., ["product A", "product B"])
    - explicit_dimensions: dimensions explicitly mentioned by user (e.g., ["features", "architecture"])
    - implicit_dimensions: dimensions you infer should be compared (e.g., ["definition", "use cases"])
  - When no explicit dimensions given, first round should focus on discovering dimensions:
    - Round 1 queries: basic "What is X" for each object to understand what aspects exist

  Return as JSON:
  {{
    "rewrites": [
      {{"strategy": "decompose", "queries": ["sub-query 1", "sub-query 2"], "parallel": true, "step": 1, "note": "purpose of this step"}},
      {{"strategy": "decompose", "queries": ["follow-up query"], "parallel": false, "depends_on": 1, "step": 2, "note": "purpose"}}
    ],
    "compare_objects": ["A", "B"],  // only for comparison queries
    "explicit_dimensions": ["features"],  // dimensions mentioned in user query
    "implicit_dimensions": ["definition", "use cases"]  // dimensions inferred to compare
  }}`,
    examples: [
      {
        input:
          'What are the differences between Product A and Product B in terms of security features?',
        output: `{"rewrites": [{"strategy": "decompose", "queries": ["Product A security features", "Product B security features"], "parallel": true, "step": 1, "note": "Gather security feature info for each product"}], "compare_objects": ["Product A", "Product B"], "explicit_dimensions": ["security features"], "implicit_dimensions": ["deployment options", "pricing", "performance"]}`
      },
      {
        input: 'What are the differences between product X, product Y, and product Z?',
        output: `{"rewrites": [{"strategy": "decompose", "queries": ["What is product X", "What is product Y", "What is product Z"], "parallel": true, "step": 1, "note": "Discover basic info and comparison dimensions for each product"}, {"strategy": "decompose", "queries": [], "parallel": true, "depends_on": 1, "step": 2, "note": "Search each dimension for all products in parallel"}], "compare_objects": ["product X", "product Y", "product Z"], "explicit_dimensions": [], "implicit_dimensions": ["definition", "features", "use cases", "architecture"]}`
      },
      {
        input: 'What are the features of each product in the platform?',
        output: `{"rewrites": [{"strategy": "decompose", "queries": ["product list"], "parallel": false, "step": 1, "note": "Get product list first"}, {"strategy": "decompose", "queries": [], "parallel": true, "depends_on": 1, "step": 2, "note": "Search features for each product in parallel"}]}`
      }
    ],
    priority: 20,
    exclusive_group: 'decomposition',
    enabled: true,
    parallel_search: true
  },
  {
    name: 'gqr',
    display_name: 'General Query Refinement',
    description:
      'Remove noise, resolve ambiguity, complete omitted information to produce a clearer query',
    applicable_when: 'Query contains colloquial expressions, noise, or ambiguous intent',
    prompt_template:
      'Refine the following query into a clearer, unambiguous expression while preserving the original intent, DONOT output the similar query as the original query:\nOriginal: {query}',
    examples: [
      {
        input: 'that port forwarding thing',
        output: 'What is the port forwarding configuration method?'
      },
      {
        input: "where's the backup setting on the management page?",
        output: 'system management console backup configuration location'
      }
    ],
    priority: 15,
    exclusive_group: 'generation',
    enabled: true,
    parallel_search: true
  },
  {
    name: 'kwr',
    display_name: 'Keyword Extraction',
    description: 'Extract core keyword combinations suitable for search engine retrieval',
    applicable_when:
      'Query is a natural language sentence that needs to be converted to keywords for retrieval matching',
    prompt_template:
      'Extract core keyword combinations from the following query, separated by spaces::\nQuery: {query}',
    examples: [
      {
        input: 'how to allow specific application traffic through the security gateway',
        output: 'security gateway application traffic policy allow'
      },
      {
        input:
          'how to configure automatic snapshots for virtual machines on the virtualization platform',
        output: 'virtualization platform VM automated snapshot backup'
      }
    ],
    priority: 5,
    exclusive_group: 'extraction',
    enabled: true,
    parallel_search: true
  },
  {
    name: 'par',
    display_name: 'Pseudo-Answer Retrieval',
    description:
      'Generate a hypothetical answer as a query (HyDE approach) to bridge the semantic gap between query and documents',
    applicable_when:
      'Semantic gap exists between the query and knowledge base documents, e.g., user asks informally but documents use technical terminology',
    prompt_template: `1. First, generate a brief hypothetical answer to the user's question (even if uncertain, make reasonable guesses)
  2. Then, extract 3-8 factual keywords from the hypothetical answer for actual search
  Keywords should be: product names, version numbers, error codes, technical terms. DO NOT copy full sentences.

  User question: {query}

  Output JSON format (keywords must be in the same language as the user's question): {{"rewrites": [{{"strategy": "par", "queries": ["keyword1 keyword2 keyword3"]}}]}}`,
    examples: [
      {
        input: '系统默认管理员密码是什么',
        output: '{{"rewrites": [{{"strategy": "par", "queries": ["系统 默认密码 admin 管理员"]}}]}}'
      },
      {
        input: 'what is the default admin password for the management system',
        output:
          '{{"rewrites": [{{"strategy": "par", "queries": ["management system default password admin"]}}]}}'
      }
    ],
    priority: 8,
    exclusive_group: 'generation',
    enabled: true,
    parallel_search: true
  },
  {
    name: 'step_back',
    display_name: 'Step-Back Abstraction',
    description: "Elevate the query's abstraction level to find broader background knowledge",
    applicable_when: 'A specific question requires more general background knowledge to answer',
    prompt_template:
      'Transform the following specific question into a broader, more abstract query:\nQuery: {query}',
    examples: [
      {
        input: '产品X v2.1 如何配置远程访问隧道',
        output: '产品X 远程访问隧道 配置方法'
      },
      {
        input: 'Product Y v3.5 IPSec tunnel configuration steps',
        output: 'Product Y IPSec tunnel architecture and configuration methods'
      },
      {
        input: 'Agent Client v2.0 installation failure on Linux',
        output: 'Agent Client installation methods and common issues'
      }
    ],
    priority: 12,
    exclusive_group: 'abstraction',
    enabled: true,
    parallel_search: true
  }
];
