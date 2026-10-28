# FastGPT Documentation Redesign

This glossary records the product language used in the documentation redesign proposal.

## Language

**Application (应用)**:
In product guides, an application is a FastGPT experience created as a Chat Agent, Chat Agent V2, or Workflow.

**Chat Agent (对话 Agent)**:
A conversational application configured around a model, instructions, and supporting knowledge or capabilities.
_Avoid_: Using the historical name "simple application" as a separate current application type.

**Chat Agent V2 (对话 Agent V2)**:
A conversational application that plans and carries out tasks using its configured tools, knowledge, and available execution environment.

**Workflow (工作流)**:
An application whose processing steps, data connections, and control paths are arranged as nodes on a visual canvas.

**Agent node (Agent 节点)**:
A workflow step that delegates a task to an Agent with its own instructions and capabilities.
_Avoid_: Treating an Agent node as a fourth application type.

**Tool (工具)**:
A callable operation with defined inputs and outputs that an application can use to perform work. A tool set groups related operations under shared connection or configuration settings.

**Workflow tool (工作流工具)**:
A reusable workflow with defined inputs and outputs that can be called by another application or run independently.

**Skill (技能)**:
A reusable resource that versions and publishes one or more sets of Agent instructions and supporting files together for use in an execution environment.
_Avoid_: Using tool and Skill interchangeably.

**MCP tool (MCP 工具)**:
A tool made available to FastGPT by an external MCP service.

**MCP service (MCP 服务)**:
A published access point through which another client can use selected FastGPT capabilities as tools.

**Knowledge base (知识库)**:
A managed body of source material prepared for retrieval and use by applications.

**Collection (集合)**:
A unit for organizing or storing content within a knowledge base. Content collections hold imported or manually added data chunks; folder collections organize other collections.

**Data chunk (数据块)**:
A unit of knowledge content that can be retrieved and maintained independently. Retrieval indexes provide searchable representations of that content.

**Published version (发布版本)**:
The saved application configuration selected to serve users through published access points.

**Publishing channel (发布渠道)**:
A way for users or external systems to access an application, such as a shared link, an API, or an integration.

**Team management (团队管理)**:
Administration of a team's members, roles, resources, and collaboration permissions.

**Write permission (写权限)**:
A resource collaborator role that can change knowledge content, including synchronization and training parameters.
_Avoid_: Using write permission to rename, disable, or otherwise change the knowledge base or collection itself.

**Manage permission (管理员)**:
A resource collaborator role that can change a knowledge base or collection's own information and assign collaborator permissions.
_Avoid_: Using manage permission as a synonym for team management or platform administration.

**Platform administration (平台运营管理)**:
Administration of the FastGPT service and its system-wide resources, configuration, and teams.
_Avoid_: Using team management and platform administration interchangeably.

**Identity proxy (身份代理)**:
An enabled delegation mode that lets an integration execute as a specified active member of the same team. The selected member's application and conversation permissions determine access.

**Portal (门户)**:
The authenticated conversation workspace (`/chat`) where signed-in team members access their own applications, team applications, favorites, and conversation history.
_Avoid_: Confusing the authenticated portal with an unauthenticated share link (`/chat/share`).

**Start node (开始节点)**:
The entry node of a workflow canvas that provides the current user question (`userChatInput`) and uploaded file links (`userFiles`) to downstream nodes.
_Avoid_: Confusing the start node with a workflow tool's custom input node (`pluginInput`).

**Global variable (全局变量)**:
An application-level variable shared across workflow steps and initialized through pre-chat forms, URL parameters, or API `variables`.

**System variable (系统变量)**:
A read-only runtime attribute injected automatically by the workflow engine (`userId`, `appId`, `chatId`, `responseChatItemId`, `histories`, `cTime`).

**Container node (嵌套容器节点)**:
A parent control node (`loopRun` or `parallelRun`) that manages an isolated inner sub-canvas with built-in child start and end nodes.

**Interactive suspension (交互挂起)**:
A checkpoint mechanism where a workflow pauses at a user-selection (`userSelect`) or form-input (`formInput`) node and resumes when the caller submits the interactive payload with the same `chatId`.

**System OpenAPI (系统开放接口)**:
The subset of FastGPT OpenAPI operations (`/apidoc/systemopenapi`) explicitly authorized for team or application API key authentication, distinct from the internal full-surface `Dev API` (`/apidoc/devapi`).

**Model pricing (模型计费配置)**:
The system-model billing configuration stored under `pricing`. LLMs use `pricing.tiers` (`inputPrice`, `outputPrice`, and optional `maxInputTokens` in M Tokens), while Embedding/Rerank (per M Tokens), TTS (per 1M characters), and STT (per 60 seconds) use `pricing.unitPrice`. Team-configured models are free of platform points.

**Inherited permission & Independent permission (继承态权限与独立态权限)**:
The two authorization states of a folder, knowledge base, or collection. An inherited resource automatically follows its parent's collaborator changes; an independent resource keeps its own collaborator list and subtree rules until inheritance is restored.

**Startup migration & Background migration (启动迁移与后台迁移)**:
The two categories of automatic system upgrade tasks. Startup migrations complete their full prerequisite dependency chain and reload models before the service accepts traffic; background migrations run asynchronously with bounded cluster concurrency and can be retried from the platform administration console.
