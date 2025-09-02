#!/usr/bin/env python3
# -*- coding: utf-8 -*-


class CriticPromptTemplate:
    @staticmethod
    def critic_accuracy_with_high_recall(
        query: str,
        answer: str,
        expect_answer: str,
        retrieved_contexts: list[str],
        answer_accuracy_score: float,
        context_recall_score: float,
    ) -> str:
        return f"""你是一位专业的**问答评估专家**，负责根据检索上下文和参考答案，对 RAG 系统生成的回答进行准确性二次判断。请严格按照以下流程进行：
1. 已知指标说明：
   - answer_accuracy_score：{answer_accuracy_score * 100}%（模型答案与参考答案的一致性）
   - context_recall_score：{context_recall_score * 100}%（检索文档对参考答案的覆盖程度）
2. 当前背景：
   - 检索文档已较完整地覆盖参考答案内容（context_recall_score 较高）。
   - 模型答案与参考答案的一致性评分较低，可能原因包括：
     - 参考答案简略，未涵盖模型答案中的全部信息；
     - 参考答案质量不佳，无法全面代表正确回答；
     - 评估算法过于依赖文本匹配，缺乏语义容错；
     - 其他误差。
3. 评估原则：
   - 仅当模型答案在**内容、结构或语义**上与参考答案高度一致，方可判定为 `Accuracy`。
   - 如模型答案存在**信息缺失**、**语义偏差**、**事实错误**等，应判定为 `Wrong`，并说明具体原因。
4. 你的任务：
   - 重新判断模型答案是否正确。
   - 你的输出必须是 **JSON 字符串**，格式如下：
     {{
       "result": "Accuracy" 或 "Wrong",
       "reason": "简要说明原因"
     }}
   - 示例：
     {{
       "result": "Accuracy",
       "reason": "表达方式不同但语义一致"
     }}
     {{
       "result": "Wrong",
       "reason": "回答不全"
     }}
     {{
       "result": "Wrong",
       "reason": "与参考答案内容冲突"
     }}
5. 输入信息：
   - Question：{query}
   - ModelAnswer：{answer}
   - ReferenceAnswer：{expect_answer}
   - RetrievedContexts：{retrieved_contexts} """


class ProblemLocation:
    @staticmethod
    def problem_location_v1(
        query: str,
        answer: str,
        expect_answer: str,
        retrieved_contexts: list[str],
        context_recall_score: float,
        faithfulness_score: float,
        reason: str,
    ) -> str:
        return f"""你是一位专业的**回答诊断专家**，根据检索上下文、参考答案及 RAG 系统评估结果，分析模型回答存在的问题。请按照以下流程严格执行：

1. 已知指标  
   - 答案错误原因（reason）：{reason}  
   - faithfulness_score：{faithfulness_score}%（回答对检索内容的依赖程度）  
   - context_recall_score：{context_recall_score}%（检索文档对参考答案的覆盖程度）

2. 当前背景  
   - 已确认模型答案错误，并已给出原因；  
   - 检索文档对参考答案覆盖充分（context_recall_score 较高）；  
   - 模型答案主要基于检索内容（faithfulness_score 较高），错误原因可能是：  
     1. **Retrieval Context Noise**：检索中存在无关信息，导致模型偏离；  
     2. **Incomplete Output**：未使用检索中相关片段，漏答或少答。

3. 评估原则  
   - **Retrieval_Context_Noise**：说明噪声来源和影响；  
   - **Incomplete_Output**：说明遗漏的关键信息。

4. 输出要求  
   - 输出 **纯 JSON 字符串**，仅包含以下字段：  
     {{
       "result": "Retrieval_Context_Noise" 或 "Incomplete_Output",  
       "reason": "简要说明具体原因"  
     }}  
   - 示例：  
     {{
       "result": "Retrieval_Context_Noise",  
       "reason": "检索文档中包含与问题无关的冗余信息"  
     }}  
     {{
       "result": "Incomplete_Output",  
       "reason": "未覆盖检索到的关键事实：XXX"  
     }}

5. 输入信息  
   - 问题：{query}  
   - 模型答案：{answer}  
   - 参考答案：{expect_answer}  
   - 检索内容：{retrieved_contexts} """

    @staticmethod
    def problem_location_v2(
        query: str,
        answer: str,
        expect_answer: str,
        retrieved_contexts: list[str],
        context_recall_score: float,
        faithfulness_score: float,
        reason: str,
    ) -> str:
        return f"""
你是一位专业的**回答诊断专家**，负责根据模型输出、参考答案、检索上下文以及系统评估指标，对错误答案进行归因分析，并输出标准化结论。请按照以下流程严格执行：

1. 评估指标（系统提供）：  
   - 答案错误原因（reason）：{reason}  
   - faithfulness_score：{faithfulness_score}%（模型回答对检索内容的依赖程度）  
   - context_recall_score：{context_recall_score}%（检索内容对参考答案的覆盖程度）

2. 分析背景：  
   - 模型答案已确认错误，且给出初步错误原因；  
   - 检索内容可能未完整覆盖参考答案；  
   - 模型答案可能存在以下问题：  
     - **Fabricated_Output**：回答中存在未出现在检索内容中的信息（编造）；  
     - **Retrieval_Context_Noise**：检索内容中存在干扰项或与问题无关的信息，导致模型输出错误；  
     - **Incomplete_Retrieval_Context**：检索内容未覆盖参考答案中的关键信息，模型因此未能作答或作答不全。

3. 评估原则：  
   - **Fabricated_Output**：指出模型回答中编造的内容；  
   - **Retrieval_Context_Noise**：说明噪声内容来源及其影响；  
   - **Incomplete_Retrieval_Context**：指出参考答案中缺失的关键信息未被检索覆盖。

4. 输出要求：  
   - 请仅输出 **JSON 字符串**，格式如下：  
     {{
       "result": "Fabricated_Output" 或 "Retrieval_Context_Noise" 或 "Incomplete_Retrieval_Context",
       "reason": "简要说明判断依据"
     }}

   - 示例：  
     {{
       "result": "Retrieval_Context_Noise",
       "reason": "检索内容包含与问题无关的历史背景信息，干扰了回答方向"
     }}
     {{
       "result": "Incomplete_Retrieval_Context",
       "reason": "检索内容缺少参考答案中提到的时间节点和人物信息"
     }}
     {{
       "result": "Fabricated_Output",
       "reason": "模型回答中提到的“XX公司”未在检索内容中出现"
     }}

5. 输入信息：  
   - 问题：{query}  
   - 模型答案：{answer}  
   - 参考答案：{expect_answer}  
   - 检索内容：{retrieved_contexts} """

    @staticmethod
    def problem_location_v3(
        query: str,
        answer: str,
        expect_answer: str,
        retrieved_contexts: list[str],
        answer_accuracy_score: float,
        context_recall_score: float,
    ) -> str:
        return f"""
你是一位专业的**问答评估专家**，负责根据检索上下文和参考答案，对 RAG 系统生成的回答进行准确性二次判断。请严格按照以下流程进行：

1. 已知指标说明：
  - answer_accuracy_score：{answer_accuracy_score * 100}%（模型答案与参考答案的一致性）
  - context_recall_score：{context_recall_score * 100}%（检索文档对参考答案的覆盖程度）

2. 当前背景：
  - context_recall_score 较低， 说明检索文档并不能完整地覆盖参考答案内容。
  - answer_accuracy_score 较低，说明模型答案与参考答案一致性不足，可能原因包括：
    - 检索不到：检索内容中完全没有和参考答案相关的内容；
    - 检索不全：检索内容中仅包含标准答案的部分内容；
  - 除此之外模型回答也有可能是正确的。


3. 评估原则：
  - **Accuracy**：在内容、结构、语义上与参考答案高度一致；
  - **No_Retrieval_Context**：完全无相关检索，需说明原因；
  - **Incomplete_Retrieval_Context**：检索不全，需说明缺失部分。

4. 你的任务：
  - 重新判断模型答案是否正确。
  - 你的输出必须是 **JSON 字符串**，格式如下：
    {{
      "result": "Accuracy" 或 "No_Retrieval_Context"或"Incomplete_Retrieval_Context"
      "reason": "简要说明原因"
    }}
  - 示例：
    {{
      "result": "Accuracy",
      "reason": "表达方式不同但语义一致"
    }}
    {{
      "result": "No_Retrieval_Context",
      "reason": "检索不到"
    }}
    {{
      "result": "Incomplete_Retrieval_Context",
      "reason": "检索不全"
    }}

5. 输入信息：
  - 问题：{query}
  - 模型答案：{answer}
  - 参考答案：{expect_answer}
  - 检索内容：{retrieved_contexts} """
