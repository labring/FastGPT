#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# flake8: noqa
from typing import List, Optional
from diting_core.metrics.utils import Language


class QAGenerateTemplate:
    @staticmethod
    def generate_qa(
        context: List[str],
        max_generation_per_context: int,
        themes: Optional[List[str]] = None,
        language: Language = Language.ENGLISH,
    ) -> str:
        if language == Language.CHINESE:
            theme_part = ""
            if themes:
                theme_part = f"""5. 请优先围绕以下主题生成问答：{themes}。如果主题与上下文完全无关，可以忽略主题，但应尽量保证问题与这些主题相关。"""
            return f"""任务: 根据给定的上下文（一个字符串列表），生成一个包含 `question` 和 `answer`键的JSON对象(问答对)列表。
                输入: 上下文（一个字符串列表）

                输出格式: 每个JSON对象应包含两个键：
                1. `question`: 提问内容
                2. `answer`: 回答内容

                要求: 

                1. 问题应**自给自足**，可以在不需要额外上下文或外部参考的情况下，仅基于给出的上下文中信息来回答。意味着它不依赖于特定的文档、表格或未包含在问题中的先验知识。
                2. 问题应**明确目标**，清楚地传达了其意图，以便能够直接和恰当地回答或执行，而没有歧义。
                3. 回答应**简洁明了**，直接回应问题，确保和问题强相关，避免添加额外的解释或评论，确保答案信息与上下文一致。
                4. 回答应**完整无误**，不遗漏问题相关的答案，基于上下文给出问题完整的解答。
                {theme_part}

                *重要提示*：

                - 请确保仅以 JSON 格式返回，'qa_pairs' 键应为 JSON 对象的列表。
                - 你必须尝试生成 {max_generation_per_context} 个问答对。
                - 生成的JSON对象`question`不能重复

                示例上下文: 
                ```
                ["Einstein won the Nobel Prize for his discovery of penicillin.", "Einstein won the Nobel Prize in 1968."]
                ```

                示例生成问答对数量: 2

                示例 JSON:
                {{
                    "qa_pairs": [
                        {{
                            "question": "What was Einstein known for?",
                            "answer": "Einstein was a smart guy huh."
                        }},
                        {{
                            "question": "Why Einstein won the Nobel Prize?",
                            "answer": "Einstein won the Nobel Prize for his discovery of penicillin."
                        }},
                    ]  
                }}


                示例上下文：
                ```
                ["Python是一种广泛使用的脚本语言。脚本语言通常用于自动化任务、快速开发和简化程序设计。", "它的优势包括易于学习和使用、快速开发、跨平台性、动态类型、丰富的库和框架以及良好的集成能力。", "然而，脚本语言也存在一些缺点，如性能较低、错误检查不足、不适合大型项目、安全性问题和依赖环境。"]
                ```

                示例生成问答对数量: 1

                示例 JSON:
                ```
                {{
                  "qa_pairs": [
                    {{
                        "question":"Python作为脚本语言，有什么优缺点？",
                        "answer":"Python的优势包括易于学习和使用、快速开发、跨平台性、动态类型、丰富的库和框架以及良好的集成能力。缺点则包括性能较低、错误检查不足、不适合大型项目、安全性问题和依赖环境。"
                    }}
                  ]
                }}
                ```


                -----
                上下文：
                ```
                {context}
                ```

                JSON:
                """
        else:
            theme_part = ""
            if themes:
                theme_part = f"""5. Please prioritize generating Q&A around the following themes: {themes}. If the themes are completely unrelated to the context, you may ignore the themes, but try to ensure the questions relate to these themes."""
            return f"""Task: Based on the given context (a list of strings), generate a list of JSON objects containing `question` and `answer` keys (Q&A pairs).
                Input: Context (a list of strings)

                Output format: Each JSON object should contain two keys:
                1. `question`: Question content
                2. `answer`: Answer content

                Requirements:

                1. Questions should be **self-sufficient**, answerable based solely on information from the given context without requiring additional context or external references. This means they should not depend on specific documents, tables, or prior knowledge not included in the question.
                2. Questions should have **clear objectives**, clearly communicating their intent so they can be answered or executed directly and appropriately without ambiguity.
                3. Answers should be **concise and clear**, directly responding to the question, ensuring strong relevance to the question, avoiding additional explanations or comments, and ensuring answer information is consistent with the context.
                4. Answers should be **complete and accurate**, not missing question-related answers, providing complete solutions to questions based on the context.
                {theme_part}

                *Important Notes*:

                - Please ensure to return only in JSON format, with the 'qa_pairs' key being a list of JSON objects.
                - You must attempt to generate {max_generation_per_context} Q&A pairs.
                - The generated JSON object `question` cannot be repeated

                Example context:
                ```
                ["Einstein won the Nobel Prize for his discovery of penicillin.", "Einstein won the Nobel Prize in 1968."]
                ```

                Example number of Q&A pairs to generate: 2

                Example JSON:
                {{
                    "qa_pairs": [
                        {{
                            "question": "What was Einstein known for?",
                            "answer": "Einstein was a smart guy huh."
                        }},
                        {{
                            "question": "Why Einstein won the Nobel Prize?",
                            "answer": "Einstein won the Nobel Prize for his discovery of penicillin."
                        }},
                    ]
                }}


                Example context:
                ```
                ["Python is a widely used scripting language. Scripting languages are typically used for automating tasks, rapid development, and simplifying program design.", "Its advantages include ease of learning and use, rapid development, cross-platform compatibility, dynamic typing, rich libraries and frameworks, and good integration capabilities.", "However, scripting languages also have some disadvantages, such as lower performance, insufficient error checking, unsuitability for large projects, security issues, and environment dependencies."]
                ```

                Example number of Q&A pairs to generate: 1

                Example JSON:
                ```
                {{
                  "qa_pairs": [
                    {{
                        "question":"What are the advantages and disadvantages of Python as a scripting language?",
                        "answer":"Python's advantages include ease of learning and use, rapid development, cross-platform compatibility, dynamic typing, rich libraries and frameworks, and good integration capabilities. Disadvantages include lower performance, insufficient error checking, unsuitability for large projects, security issues, and environment dependencies."
                    }}
                  ]
                }}
                ```


                -----
                Context:
                ```
                {context}
                ```

                JSON:
                """

    @staticmethod
    def rewrite_qa(
        context: List[str],
        question: str,
        answer: str,
        feedback: str,
        max_rewrite_qa: int = 1,
        language: Language = Language.ENGLISH,
    ) -> str:
        if language == Language.CHINESE:
            return f"""我希望你充当一个问题重写器。根据提供的上下文、原始问题、原始答案和反馈，生成一至多个重写的QA，基于所提供的反馈来提高其清晰度、可回答性以及答案的准确性。
                **
                重要提示：请确保仅以 JSON 格式返回。
                
                示例上下文： "金门大桥位于旧金山，建成于1937年，以其装饰艺术风格而闻名。它连接旧金山市和马林县，跨越金门海峡。"
                示例问题： "这座桥是什么时候建成的？"
                示例答案： "金门大桥建成于1937年。"
                示例反馈： "这个问题询问的是 '这座桥' 的建成时间，但没有具体说明指的是哪座桥。有许多著名的桥梁，如果不指定名称，问题就太模糊了。为了提高清晰度，请包含桥的名称。"
                示例重写问答对数量: 1
                示例 JSON：
                {{
                  "qa_pairs": [
                    {{
                        "question":"金门大桥是什么时候建成的？",
                        "answer":"金门大桥建成于1937年。"
                    }}
                  ]
                }}
                
                示例上下文： "论文《量子计算的进展》由爱丽丝·汤普森博士撰写，并于2022年发表。它探讨了量子计算在密码学和药物发现中的潜在应用。"
                示例问题： "论文中讨论了哪些量子计算的应用？"
                示例答案： "论文《量子计算的进展》中探讨了量子计算在密码学和药物发现中的潜在应用。"
                示例反馈： "问题询问的是量子计算的应用，但没有具体说明引用的是哪篇论文。由于许多论文可能讨论量子计算，指定论文的标题或作者将有助于提高清晰度。"
                示例重写问答对数量: 2
                示例 JSON：
                {{
                   "qa_pairs": [
                    {{
                        "question":"论文《量子计算的进展》中讨论了哪些量子计算的应用？",
                        "answer":"论文《量子计算的进展》中探讨了量子计算在密码学和药物发现中的潜在应用。"
                    }},
                    {{
                        "question":"论文《量子计算的进展》是谁写的？",
                        "answer":"论文《量子计算的进展》由爱丽丝·汤普森博士撰写。"
                    }}
                  ]
                }}
                
                示例上下文： "论文《量子计算的进展》由爱丽丝·汤普森博士撰写，并于2022年发表。它探讨了量子计算在密码学和药物发现中的潜在应用。"
                示例问题： "论文《量子计算的进展》中讨论了哪些量子计算的应用？"
                示例答案： "论文《量子计算的进展》由爱丽丝·汤普森博士撰写，并于2022年发表。"
                示例反馈： "问题具体指向了`哪些量子计算的应用`，但答案给的是`作者及发表时间`，存在答非所问。"
                示例重写问答对数量: 1
                示例 JSON：
                {{
                   "qa_pairs": [
                    {{
                        "question":"论文《量子计算的进展》中讨论了哪些量子计算的应用？",
                        "answer":"论文《量子计算的进展》中探讨了量子计算在密码学和药物发现中的潜在应用。"
                    }}
                  ]
                }}
                
                你不应融入任何先前的知识，重写的问题应仅基于提供的上下文和反馈。
                **
                
                上下文：
                {context}
                
                问题：
                {question}
                
                答案：
                {answer}
                
                反馈：
                {feedback}
                示例重写问答对数量: {max_rewrite_qa}
                
                JSON
                """
        else:
            return f"""I want you to act as a question rewriter. Based on the provided context, original question, original answer, and feedback, generate one or more rewritten QAs to improve their clarity, answerability, and answer accuracy based on the provided feedback.
                **
                Important note: Please ensure to return only in JSON format.

                Example context: "The Golden Gate Bridge is located in San Francisco, completed in 1937, and known for its Art Deco style. It connects San Francisco and Marin County, spanning the Golden Gate Strait."
                Example question: "When was this bridge completed?"
                Example answer: "The Golden Gate Bridge was completed in 1937."
                Example feedback: "This question asks about when 'this bridge' was completed, but doesn't specifically state which bridge it refers to. There are many famous bridges, and without specifying the name, the question is too vague. To improve clarity, please include the bridge's name."
                Example number of rewritten Q&A pairs: 1
                Example JSON:
                {{
                  "qa_pairs": [
                    {{
                        "question":"When was the Golden Gate Bridge completed?",
                        "answer":"The Golden Gate Bridge was completed in 1937."
                    }}
                  ]
                }}

                Example context: "The paper 'Advances in Quantum Computing' was written by Dr. Alice Thompson and published in 2022. It explores potential applications of quantum computing in cryptography and drug discovery."
                Example question: "What applications of quantum computing are discussed in the paper?"
                Example answer: "The paper 'Advances in Quantum Computing' explores potential applications of quantum computing in cryptography and drug discovery."
                Example feedback: "The question asks about applications of quantum computing but doesn't specifically mention which paper is being referenced. Since many papers might discuss quantum computing, specifying the paper's title or author would help improve clarity."
                Example number of rewritten Q&A pairs: 2
                Example JSON:
                {{
                   "qa_pairs": [
                    {{
                        "question":"What applications of quantum computing are discussed in the paper 'Advances in Quantum Computing'?",
                        "answer":"The paper 'Advances in Quantum Computing' explores potential applications of quantum computing in cryptography and drug discovery."
                    }},
                    {{
                        "question":"Who wrote the paper 'Advances in Quantum Computing'?",
                        "answer":"The paper 'Advances in Quantum Computing' was written by Dr. Alice Thompson."
                    }}
                  ]
                }}

                Example context: "The paper 'Advances in Quantum Computing' was written by Dr. Alice Thompson and published in 2022. It explores potential applications of quantum computing in cryptography and drug discovery."
                Example question: "What applications of quantum computing are discussed in the paper 'Advances in Quantum Computing'?"
                Example answer: "The paper 'Advances in Quantum Computing' was written by Dr. Alice Thompson and published in 2022."
                Example feedback: "The question specifically asks about 'what applications of quantum computing', but the answer provides 'author and publication time', which is off-topic."
                Example number of rewritten Q&A pairs: 1
                Example JSON:
                {{
                   "qa_pairs": [
                    {{
                        "question":"What applications of quantum computing are discussed in the paper 'Advances in Quantum Computing'?",
                        "answer":"The paper 'Advances in Quantum Computing' explores potential applications of quantum computing in cryptography and drug discovery."
                    }}
                  ]
                }}

                You should not incorporate any prior knowledge. The rewritten questions should be based solely on the provided context and feedback.
                **

                Context:
                {context}

                Question:
                {question}

                Answer:
                {answer}

                Feedback:
                {feedback}
                Example number of rewritten Q&A pairs: {max_rewrite_qa}

                JSON
                """
