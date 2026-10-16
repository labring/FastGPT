# FastGPT Documentation Redesign

This glossary records the maintained product terminology used by the Chinese and English documentation.

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

**Platform administration (平台运营管理)**:
Administration of the FastGPT service and its system-wide resources, configuration, and teams.
_Avoid_: Using team management and platform administration interchangeably.

**Identity proxy (身份代理)**:
An enabled delegation mode that lets an integration execute as a specified active member of the same team. The selected member's application and conversation permissions determine access.
