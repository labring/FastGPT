#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# flake8: noqa

from diting_core.metrics.utils import Language


class QAQualityTemplate:
    @staticmethod
    def evaluate_question_self(
        question: str, language: Language = Language.ENGLISH
    ) -> str:
        if language == Language.CHINESE:
            return f"""任务: 评估给出的查询/问题的清晰度和可回答性，假设具备足够的领域知识。使用以下标准来指导你的评估：
        1. **自给自足**：该问题是否可以在不需要额外上下文或外部参考的情况下理解和完成？它应该是自足的，意味着它不依赖于任何先验知识，避免问题宽泛。
        2. **明确目标**：该问题是否清楚地传达了其意图？它应该明确说明请求什么信息、行动或响应，以便能够直接和恰当地回答，而没有歧义，避免问题模糊。

        根据这些标准，给出一个介于 0 和 1 之间的分数，其中：
        - "1" 表示问题清晰、自给自足且可回答；
        - "0" 表示问题模糊，依赖外部参考，或意图不明确；
        - 介于 0 和 1 之间的分数表示部分清晰或可回答性，查询满足某些但不是所有标准。

        输入: 问题（字符串）

        输出格式: 一个JSON对象，包含 'score' 和 'feedback' 键：
        1. `score`: 质量得分，必须是一个介于 0 到 1 之间的浮点数。
        2. `feedback`: 原因或反馈 ，必须是一个字符串

        示例问题：
        ```
        "在过去 20 年中，哪些技术创新改变了通信？"
        ```
        示例 JSON:
        ```
        {{
            "feedback": "该查询有些模糊，因为它询问 '技术创新' 而没有具体说明通信的特定领域（例如，社交媒体、消息应用）。通过将焦点缩小到特定类型的创新或时间范围，可以改进此查询。",
            "score": 0.5
        }}
        ```

        示例问题：
        ```
        "解释可再生能源政策在 2021 年对德国地方经济的影响。"
        ```
        示例 JSON:
        ```
        {{
            "feedback": "该查询清楚地指定了焦点（可再生能源政策）、地区（德国）和时间范围（2021 年）。它是自给自足的，并且在不需要额外上下文的情况下可回答，使其清晰有效。",
            "score": 1.0
        }}
        ```

        示例问题：
        ```
        "当前美国教育系统的主要批评是什么？"
        ```
        示例 JSON:
        ```
        {{
            "feedback": "该问题范围广泛且缺乏具体性，因为 '主要批评' 可能涉及多个方面（例如，资金、课程、公平）。为了提高清晰度，可以具体说明教育系统的哪个方面受到批评。",
            "score": 0.4
        }}
        ```

        示例问题：
        ```
        "讨论人工智能在医疗保健中的作用，特别是在诊断方面，如最后报告中所述。"
        ```
        示例 JSON:
        ```
        {{
            "feedback": "该问题提到 '最后报告' 而没有提供上下文或细节，使其不清晰且依赖于外部信息。如果提供一些关于报告的背景或定义要讨论的人工智能在诊断中的哪些方面，将会更清晰。",
            "score": 0.3
        }}
        ```

        -----

        问题：
        ```
        {question}
        ```

        JSON:
        """
        else:
            return f"""Task: Evaluate the clarity and answerability of the given query/question, assuming sufficient domain knowledge. Use the following criteria to guide your evaluation:
        1. **Self-sufficiency**: Can the question be understood and answered without requiring additional context or external references? It should be self-contained, meaning it doesn't rely on any prior knowledge, avoiding broad questions.
        2. **Clear objective**: Does the question clearly communicate its intent? It should explicitly state what information, action, or response is requested so it can be answered directly and appropriately without ambiguity, avoiding vague questions.

        Based on these criteria, provide a score between 0 and 1, where:
        - "1" indicates the question is clear, self-sufficient, and answerable;
        - "0" indicates the question is vague, relies on external references, or has unclear intent;
        - Scores between 0 and 1 indicate partial clarity or answerability, where the query meets some but not all criteria.

        Input: Question (string)

        Output format: A JSON object containing 'score' and 'feedback' keys:
        1. `score`: Quality score, must be a float between 0 and 1.
        2. `feedback`: Reason or feedback, must be a string

        Example question:
        ```
        "What technological innovations have changed communication in the past 20 years?"
        ```
        Example JSON:
        ```
        {{
            "feedback": "The query is somewhat vague as it asks about 'technological innovations' without specifying particular areas of communication (e.g., social media, messaging apps). This query could be improved by narrowing the focus to specific types of innovations or timeframes.",
            "score": 0.5
        }}
        ```

        Example question:
        ```
        "Explain the impact of renewable energy policies on Germany's local economy in 2021."
        ```
        Example JSON:
        ```
        {{
            "feedback": "The query clearly specifies the focus (renewable energy policies), region (Germany), and timeframe (2021). It is self-sufficient and answerable without additional context, making it clear and effective.",
            "score": 1.0
        }}
        ```

        Example question:
        ```
        "What are the main criticisms of the current U.S. education system?"
        ```
        Example JSON:
        ```
        {{
            "feedback": "The question is broad and lacks specificity, as 'main criticisms' could refer to multiple aspects (e.g., funding, curriculum, equity). To improve clarity, it could specify which aspect of the education system is being criticized.",
            "score": 0.4
        }}
        ```

        Example question:
        ```
        "Discuss the role of artificial intelligence in healthcare, particularly in diagnostics, as mentioned in the last report."
        ```
        Example JSON:
        ```
        {{
            "feedback": "The question mentions 'the last report' without providing context or details, making it unclear and dependent on external information. It would be clearer if some background about the report was provided or if specific aspects of AI in diagnostics were defined for discussion.",
            "score": 0.3
        }}
        ```

        -----

        Question:
        ```
        {question}
        ```

        JSON:
        """

    @staticmethod
    def evaluate_answer_no_context(
        question: str, answer: str, language: Language = Language.ENGLISH
    ) -> str:
        if language == Language.CHINESE:
            return f"""任务: 基于给出的问题，评估其关联的答案相关度，假设具备足够的领域知识。使用以下标准来指导你的评估：
        1. **相关性**：答案是否直接与问题相关？是否包含了问题的关键词或主题？
        2. **完整性**：答案是否提供了足够的信息来全面回答问题？是否遗漏了重要的细节或背景信息？
        3. **清晰度**：答案是否表达清晰，易于理解？是否合乎逻辑？
        4. **简洁性**：答案是否表达简洁，是否包含了大量无关的信息导致答案噪声？

        根据这些标准，给出一个介于 0 和 1 之间的分数，其中：
        - "1" 表示答案简洁清晰，和问题强相关并提供了足够的信息来全面回答问题。
        - "0" 表示答案冗余、逻辑混乱，信息缺失或答非所问。
        - 介于 0 和 1 之间的分数表示部分相关、完整性、清晰度和简洁性，查询满足某些但不是所有标准。

        输入: 问题（字符串），答案（字符串）

        输出格式: 一个JSON对象，包含 'score' 和 'feedback' 键：
        1. `score`: 质量得分，必须是一个介于 0 到 1 之间的浮点数。
        2. `feedback`: 原因或反馈 ，必须是一个字符串

        示例问题：
        ```
        "Python作为脚本语言，有什么优缺点？"
        ```
        示例答案：
        ```
        "Python的优势包括易于学习和使用、快速开发、跨平台性、动态类型、丰富的库和框架以及良好的集成能力。缺点则包括性能较低、错误检查不足、不适合大型项目、安全性问题和依赖环境。"
        ```
        示例 JSON:
        ```
        {{
            "feedback": "该回答针对问题进行明确且简洁地回答，且内容提供了足够的信息来全面回答问题。",
            "score": 1.0
        }}
        ```

        示例问题：
        ```
        "当前美国教育系统的主要批评是什么？"
        ```
        示例答案：
        ```
        "当前美国教育系统的主要批评如下：

        1. 基础教育过于薄弱

        美国的中小学教育普遍停留在非常基础的水平，尤其是理科教育，有些学生甚至到了高中才接触一元一次方程。也有很多人直到高中才开始学习外语。

        ```
        示例 JSON:

        ```
        {{
            "feedback": "该回答针对问题进行明确地回答，但回答内容提供的信息不足以完全回答问题",
            "score": 0.5
        }}
        ```


        示例问题：
        ```
        "解释可再生能源政策在 2021 年对德国地方经济的影响。"
        ```
        示例答案：
        ```
        "德国政府为推动可再生能源发展，投入大量资金用于补贴与项目支持。EEG2021 虽然计划逐步转向市场驱动，但在 2021 年仍需大量财政资金支持。"
        ```
        示例 JSON:
        ```
        {{
            "feedback": "该回答没有针对问题进行明确地回答，存在答非所问的情况(问的是对地方经济的影响，回答的是资金需求)。",
            "score": 0.0
        }}
        ```

        示例问题：
        ```
        "讨论人工智能在医疗保健中的作用，特别是在诊断和治疗方面。"
        ```
        示例答案：
        ```
        "人工智能在诊断方面，可以分析医学图像（如X光片、CT扫描和MRI），帮助医生更准确地识别疾病。例如，AI可以通过深度学习模型检测早期癌症迹象，从而提高早期诊断率；
        同时，AI可以自动化重复性和繁琐的任务，从而提高工作效率，减少人力成本；AI还能够处理和分析大量数据，帮助企业和组织从中提取有价值的信息，做出更明智的决策；
        通过机器学习，AI可以根据用户的行为和偏好提供个性化的推荐和服务，提升用户体验。"
        ```
        示例 JSON:
        ```
        {{
            "feedback": "该回答内容和问题部分相关，不简洁，存在逻辑混乱、答案冗余的情况。",
            "score": 0.3
        }}
        ```
        -----

        问题：
        ```
        {question}
        ```

        答案：
        ```
        {answer}
        ```

        JSON:
        """
        else:
            return f"""Task: Based on the given question, evaluate the relevance of the associated answer, assuming sufficient domain knowledge. Use the following criteria to guide your evaluation:
        1. **Relevance**: Is the answer directly related to the question? Does it contain key terms or themes from the question?
        2. **Completeness**: Does the answer provide sufficient information to comprehensively answer the question? Are important details or background information missing?
        3. **Clarity**: Is the answer clearly expressed and easy to understand? Is it logical?
        4. **Conciseness**: Is the answer expressed concisely, or does it contain a lot of irrelevant information causing noise?

        Based on these criteria, provide a score between 0 and 1, where:
        - "1" indicates the answer is concise and clear, strongly relevant to the question, and provides sufficient information to comprehensively answer it.
        - "0" indicates the answer is redundant, logically confused, has missing information, or is off-topic.
        - Scores between 0 and 1 indicate partial relevance, completeness, clarity, and conciseness, meeting some but not all criteria.

        Input: Question (string), Answer (string)

        Output format: A JSON object containing 'score' and 'feedback' keys:
        1. `score`: Quality score, must be a float between 0 and 1.
        2. `feedback`: Reason or feedback, must be a string

        Example question:
        ```
        "What are the advantages and disadvantages of Python as a scripting language?"
        ```
        Example answer:
        ```
        "Python's advantages include ease of learning and use, rapid development, cross-platform compatibility, dynamic typing, rich libraries and frameworks, and good integration capabilities. Disadvantages include lower performance, insufficient error checking, unsuitability for large projects, security issues, and environment dependencies."
        ```
        Example JSON:
        ```
        {{
            "feedback": "The answer clearly and concisely addresses the question, providing sufficient information to comprehensively answer it.",
            "score": 1.0
        }}
        ```

        Example question:
        ```
        "What are the main criticisms of the current U.S. education system?"
        ```
        Example answer:
        ```
        "The main criticisms of the current U.S. education system include:

        1. Weak foundational education

        U.S. elementary and secondary education generally remains at a very basic level, especially in science education, with some students not encountering linear equations until high school. Many people don't start learning foreign languages until high school either.

        ```
        Example JSON:

        ```
        {{
            "feedback": "The answer clearly addresses the question, but the content provided is insufficient to completely answer the question.",
            "score": 0.5
        }}
        ```


        Example question:
        ```
        "Explain the impact of renewable energy policies on Germany's local economy in 2021."
        ```
        Example answer:
        ```
        "The German government invested significant funds in subsidies and project support to promote renewable energy development. Although EEG2021 plans to gradually transition to market-driven approaches, it still required substantial fiscal funding support in 2021."
        ```
        Example JSON:
        ```
        {{
            "feedback": "The answer does not clearly address the question and is off-topic (the question asks about impact on local economy, but the answer discusses funding requirements).",
            "score": 0.0
        }}
        ```

        Example question:
        ```
        "Discuss the role of artificial intelligence in healthcare, particularly in diagnostics and treatment."
        ```
        Example answer:
        ```
        "In diagnostics, artificial intelligence can analyze medical images (such as X-rays, CT scans, and MRIs) to help doctors more accurately identify diseases. For example, AI can detect early signs of cancer through deep learning models, thereby improving early diagnosis rates; at the same time, AI can automate repetitive and tedious tasks, improving work efficiency and reducing labor costs; AI can also process and analyze large amounts of data, helping businesses and organizations extract valuable information and make more informed decisions; through machine learning, AI can provide personalized recommendations and services based on user behavior and preferences, enhancing user experience."
        ```
        Example JSON:
        ```
        {{
            "feedback": "The answer content is partially relevant to the question, lacks conciseness, and shows logical confusion and redundancy.",
            "score": 0.3
        }}
        ```
        -----

        Question:
        ```
        {question}
        ```

        Answer:
        ```
        {answer}
        ```

        JSON:
        """

    @staticmethod
    def evaluate_question_with_context(
        question: str,
        retrieval_context: list[str],
        language: Language = Language.ENGLISH,
    ) -> str:
        if language == Language.CHINESE:
            return f"""任务: 基于给出的上下文，评估其关联的查询/问题的可回答性。使用以下步骤来指导你的评估：

            1. 识别关键要素：确定问题中的关键概念和要素，这些要素通常包括主题、时间、地点和特定细节。
            2. 遍历上下文：仔细阅读给定的上下文，寻找与问题关键要素相关的信息。注意上下文中是否包含直接的答案或相关的细节。
            3. 查找直接回答：尝试在上下文中找到能够直接回答问题的信息。这可以是明确的句子、数据或描述。
            4. 评估信息的相关性：判断上下文中的信息是否足够相关，能够直接解决问题的请求。如果信息不相关，即使在文本中存在，也无法提供有效答案。
            5. 考虑上下文的完整性：确认上下文是否足够全面，以支持对问题的正确回答。如果上下文的信息过于有限或片面，可能无法找到答案。
            6. 识别隐含信息：在某些情况下，问题的答案可能不会直接给出，而是需要从上下文中推断出来。评估是否可以通过逻辑推理得出答案。
            7. 避免假设外部知识：确保答案不依赖于任何外部知识或信息，完全基于提供的上下文。如果问题需要额外的信息来理解，那么它可能不适合在该上下文中找到答案。

            根据这些步骤，给出一个介于 0 和 1 之间的分数，其中：
            - "1" 表示问题可以完全基于给出的上下文中回答，无需额外先验知识；
            - "0" 表示问题无法在给出的上下文中找到答案；
            - 介于 0 和 1 之间的分数表示部分可回答性，问题满足某些但不是所有标准。

            输入: 上下文（一个字符串列表），问题（字符串）

            输出格式: 一个JSON对象，包含 'score' 和 'feedback' 键：
            1. `score`: 质量得分，必须是一个介于 0 到 1 之间的浮点数。
            2. `feedback`: 原因或反馈 ，必须是一个字符串

            示例上下文：
            ```
            ["Python是一种广泛使用的脚本语言。脚本语言通常用于自动化任务、快速开发和简化程序设计。", "它的优势包括易于学习和使用、快速开发、跨平台性、动态类型、丰富的库和框架以及良好的集成能力。", "然而，脚本语言也存在一些缺点，如性能较低、错误检查不足、不适合大型项目、安全性问题和依赖环境。"]
            ```
            示例问题：
            ```
            "Python作为脚本语言，有什么优缺点？"
            ```
            示例 JSON:
            ```
            {{
                "feedback": "该问题的焦点和上下文主题强相关(Python，脚本语言，优缺点)，且不需要额外上下文的情况下即可回答。",
                "score": 1.0
            }}
            ```

            示例上下文：
            ```
            ["人工智能算法可以分析医学图像（如X光片、CT扫描和MRI），帮助医生更准确地识别疾病。例如，AI可以通过深度学习模型检测早期癌症迹象，从而提高早期诊断率。", "AI可以基于患者的遗传信息、病史和其他数据，制定个性化的治疗方案。这种方法有助于优化药物选择和剂量，从而提高治疗效果。", "人工智能加速了药物研发过程，通过分析大量数据发现新的药物靶点，优化药物化合物设计，以及预测药物的临床试验效果。"]
            ```
            示例问题：
            ```
            "讨论人工智能在医疗保健中的作用，特别是在诊断方面，如最后报告中所述。"
            ```
            示例 JSON:
            ```
            {{
                "feedback": "该问题提到 '最后报告' 而没有提供上下文或细节，使其不清晰且依赖于外部信息。",
                "score": 0.3
            }}
            ```

            示例上下文：
            ```
            ["以“爱”与“尊重”为中心的美国教育环境造就了成千上万个自我中心的个人主义者。", "公立学校的学区制和私立学校一年高达5-6万美元的学费却让许多家庭望而却步。如果没有优越的经济条件，孩子甚至没有接受良好教育的机会。"]
            ```
            示例问题：
            ```
            "当前美国社会的主要批评是什么？"
            ```
            示例 JSON:
            ```
            {{
                "feedback": "该问题的焦点'主要批评' 可能涉及多个方面（例如，人权、教育、公平），此外，上下文的主题是美国教育，问题背景是美国社会，相关性较低。",
                "score": 0.2
            }}
            ```


            示例上下文：
            ```
            ["德国长期致力于能源转型，2021 年生效的新版《可再生能源法》（EEG2021）具有重要意义。该法案于 2020 年 12 月 17 日获得议会通过，其目标在于进一步加快可再生能源发展，同时降低电力用户负担。", "可再生能源政策在 2021 年对德国地方经济的影响主要在以下两方面：
            1. 可再生能源产业扩张：在政策推动下，德国可再生能源产业在 2021 年持续扩张。以太阳能光伏产业为例，EEG2021 计划将光伏发电量大幅提升的目标，刺激了相关企业扩大生产规模与加大研发投入", "2. 就业岗位增加：可再生能源产业的发展创造了大量就业机会。直接就业岗位涵盖了从能源设备制造、项目建设施工，到后期运营维护等多个环节。"]
            ```
            示例问题：
            ```
            "解释可再生能源政策在 2022 年对英国中央财政的影响。"
            ```
            示例 JSON:
            ```
            {{
                "feedback": "该问题的焦点和上下文的主题相关性不高，无法基于给出的上下文回答",
                "score": 0.0
            }}
            ```

            -----


            上下文：
            ```
            {retrieval_context}
            ```

            问题：
            ```
            {question}
            ```

            JSON:
            """
        else:
            return f"""Task: Based on the given context, evaluate the answerability of the associated query/question. Use the following steps to guide your evaluation:

            1. Identify key elements: Determine the key concepts and elements in the question, which typically include topics, time, location, and specific details.
            2. Traverse the context: Carefully read the given context, looking for information related to the key elements of the question. Note whether the context contains direct answers or relevant details.
            3. Look for direct answers: Try to find information in the context that can directly answer the question. This can be explicit sentences, data, or descriptions.
            4. Assess information relevance: Judge whether the information in the context is sufficiently relevant to directly address the question's request. If the information is irrelevant, even if it exists in the text, it cannot provide an effective answer.
            5. Consider context completeness: Confirm whether the context is comprehensive enough to support a correct answer to the question. If the context information is too limited or one-sided, it may not be possible to find an answer.
            6. Identify implicit information: In some cases, the answer to the question may not be directly given but needs to be inferred from the context. Evaluate whether the answer can be derived through logical reasoning.
            7. Avoid assuming external knowledge: Ensure that the answer does not rely on any external knowledge or information and is completely based on the provided context. If the question requires additional information to understand, it may not be suitable for finding an answer in that context.

            Based on these steps, provide a score between 0 and 1, where:
            - "1" indicates the question can be completely answered based on the given context without additional prior knowledge;
            - "0" indicates the question cannot find an answer in the given context;
            - Scores between 0 and 1 indicate partial answerability, where the question meets some but not all criteria.

            Input: Context (a list of strings), Question (string)

            Output format: A JSON object containing 'score' and 'feedback' keys:
            1. `score`: Quality score, must be a float between 0 and 1.
            2. `feedback`: Reason or feedback, must be a string

            Example context:
            ```
            ["Python is a widely used scripting language. Scripting languages are typically used for automating tasks, rapid development, and simplifying program design.", "Its advantages include ease of learning and use, rapid development, cross-platform compatibility, dynamic typing, rich libraries and frameworks, and good integration capabilities.", "However, scripting languages also have some disadvantages, such as lower performance, insufficient error checking, unsuitability for large projects, security issues, and environment dependencies."]
            ```
            Example question:
            ```
            "What are the advantages and disadvantages of Python as a scripting language?"
            ```
            Example JSON:
            ```
            {{
                "feedback": "The question's focus is strongly related to the context themes (Python, scripting language, advantages and disadvantages), and can be answered without additional context.",
                "score": 1.0
            }}
            ```

            Example context:
            ```
            ["Artificial intelligence algorithms can analyze medical images (such as X-rays, CT scans, and MRIs) to help doctors more accurately identify diseases. For example, AI can detect early signs of cancer through deep learning models, thereby improving early diagnosis rates.", "AI can develop personalized treatment plans based on patients' genetic information, medical history, and other data. This approach helps optimize drug selection and dosage, thereby improving treatment effectiveness.", "Artificial intelligence accelerates the drug development process by analyzing large amounts of data to discover new drug targets, optimize drug compound design, and predict clinical trial effects."]
            ```
            Example question:
            ```
            "Discuss the role of artificial intelligence in healthcare, particularly in diagnostics, as mentioned in the last report."
            ```
            Example JSON:
            ```
            {{
                "feedback": "The question mentions 'the last report' without providing context or details, making it unclear and dependent on external information.",
                "score": 0.3
            }}
            ```

            Example context:
            ```
            ["The education environment centered on 'love' and 'respect' in America has created thousands of self-centered individualists.", "The school district system for public schools and the annual tuition of $50,000-60,000 for private schools discourage many families. Without superior economic conditions, children don't even have the opportunity to receive a good education."]
            ```
            Example question:
            ```
            "What are the main criticisms of current American society?"
            ```
            Example JSON:
            ```
            {{
                "feedback": "The question's focus 'main criticisms' may involve multiple aspects (e.g., human rights, education, equity). Additionally, the context theme is American education, while the question background is American society, with low relevance.",
                "score": 0.2
            }}
            ```


            Example context:
            ```
            ["Germany has long been committed to energy transition, and the new version of the Renewable Energy Act (EEG2021) that came into effect in 2021 is of great significance. The bill was passed by parliament on December 17, 2020, with the goal of further accelerating renewable energy development while reducing the burden on electricity users.", "The impact of renewable energy policies on Germany's local economy in 2021 was mainly in the following two aspects: 1. Renewable energy industry expansion: Under policy promotion, Germany's renewable energy industry continued to expand in 2021. Taking the solar photovoltaic industry as an example, EEG2021's plan to significantly increase photovoltaic power generation stimulated related companies to expand production scale and increase R&D investment", "2. Increased employment opportunities: The development of the renewable energy industry created a large number of job opportunities. Direct employment positions covered multiple links from energy equipment manufacturing, project construction, to later operation and maintenance."]
            ```
            Example question:
            ```
            "Explain the impact of renewable energy policies on the UK's central finances in 2022."
            ```
            Example JSON:
            ```
            {{
                "feedback": "The question's focus has low relevance to the context theme and cannot be answered based on the given context.",
                "score": 0.0
            }}
            ```

            -----


            Context:
            ```
            {retrieval_context}
            ```

            Question:
            ```
            {question}
            ```

            JSON:
            """

    @staticmethod
    def evaluate_answer_with_context(
        question: str,
        answer: str,
        retrieval_context: list[str],
        language: Language = Language.ENGLISH,
    ) -> str:
        if language == Language.CHINESE:
            return f"""任务: 基于给出的上下文和问题，评估其关联的答案质量，假设具备足够的领域知识。使用以下标准来指导你的评估：
            1. **简洁明了**：该答案是否直接回应了问题？它应该和问题强相关，避免答非所问。
            2. **完整无误**：该答案是否完整且准确地回答了问题？它应当避免回答噪声或回答不全。

            根据这些标准，给出一个介于 0 和 1 之间的分数，其中：
            - "1" 表示答案简洁，对照问题完整无误。
            - "0" 表示答案冗余，信息缺失或答非所问。
            - 介于 0 和 1 之间的分数表示部分清晰或可回答性，查询满足某些但不是所有标准。

            输入: 上下文（一个字符串列表），问题（字符串），答案（字符串）

            输出格式: 一个JSON对象，包含 'score' 和 'feedback' 键：
            1. `score`: 质量得分，必须是一个介于 0 到 1 之间的浮点数。
            2. `feedback`: 原因或反馈 ，必须是一个字符串

            示例上下文：
            ```
            ["Python是一种广泛使用的脚本语言。脚本语言通常用于自动化任务、快速开发和简化程序设计。", "它的优势包括易于学习和使用、快速开发、跨平台性、动态类型、丰富的库和框架以及良好的集成能力。", "然而，脚本语言也存在一些缺点，如性能较低、错误检查不足、不适合大型项目、安全性问题和依赖环境。"]
            ```
            示例问题：
            ```
            "Python作为脚本语言，有什么优缺点？"
            ```
            示例答案：
            ```
            "Python的优势包括易于学习和使用、快速开发、跨平台性、动态类型、丰富的库和框架以及良好的集成能力。缺点则包括性能较低、错误检查不足、不适合大型项目、安全性问题和依赖环境。"
            ```
            示例 JSON:
            ```
            {{
                "feedback": "该回答针对问题进行明确地回答，且内容完全在上下文范围内，不漏答、不误答。",
                "score": 1.0
            }}
            ```

            示例上下文：
            ```
            ["以“爱”与“尊重”为中心的美国教育环境造就了成千上万个自我中心的个人主义者。", "公立学校的学区制和私立学校一年高达5-6万美元的学费却让许多家庭望而却步。如果没有优越的经济条件，孩子甚至没有接受良好教育的机会。"]
            ```
            示例问题：
            ```
            "当前美国教育系统的主要批评是什么？"
            ```
            示例答案：
            ```
            "当前美国教育系统的主要批评如下：

            1. 基础教育过于薄弱

            美国的中小学教育普遍停留在非常基础的水平，尤其是理科教育，有些学生甚至到了高中才接触一元一次方程。也有很多人直到高中才开始学习外语。

            2. 普遍个人主义

            以“爱”与“尊重”为中心的美国教育环境造就了成千上万个自我中心的个人主义者。

            3. 教育费用高昂

            公立学校的学区制和私立学校一年高达5-6万美元的学费却让许多家庭望而却步。如果没有优越的经济条件，孩子甚至没有接受良好教育的机会。"
            ```
            示例 JSON:

            ```
            {{
                "feedback": "该回答针对问题进行明确地回答，不漏答、不误答，但回答内容超出了上下文范围内(`基础教育过于薄弱`未在上下文中提及)。",
                "score": 0.6
            }}
            ```


            示例上下文：
            ```
            ["德国长期致力于能源转型，2021 年生效的新版《可再生能源法》（EEG2021）具有重要意义。该法案于 2020 年 12 月 17 日获得议会通过，其目标在于进一步加快可再生能源发展，同时降低电力用户负担。", "可再生能源政策在 2021 年对德国地方经济的影响主要在以下两方面：
            1. 可再生能源产业扩张：在政策推动下，德国可再生能源产业在 2021 年持续扩张。以太阳能光伏产业为例，EEG2021 计划将光伏发电量大幅提升的目标，刺激了相关企业扩大生产规模与加大研发投入", "2. 就业岗位增加：可再生能源产业的发展创造了大量就业机会。直接就业岗位涵盖了从能源设备制造、项目建设施工，到后期运营维护等多个环节。"]
            ```
            示例问题：
            ```
            "解释可再生能源政策在 2021 年对德国地方经济的影响。"
            ```
            示例答案：
            ```
            "德国政府为推动可再生能源发展，投入大量资金用于补贴与项目支持。EEG2021 虽然计划逐步转向市场驱动，但在 2021 年仍需大量财政资金支持。"
            ```
            示例 JSON:
            ```
            {{
                "feedback": "该回答没有针对问题进行明确地回答，存在答非所问的情况(问的是对地方经济的影响，回答的是资金需求)，同时，回答内容超出了上下文范围内(`需要大量财政资金支持`未在上下文中提及)。",
                "score": 0.0
            }}
            ```

            示例上下文：
            ```
            ["人工智能算法可以分析医学图像（如X光片、CT扫描和MRI），帮助医生更准确地识别疾病。例如，AI可以通过深度学习模型检测早期癌症迹象，从而提高早期诊断率。", "AI可以基于患者的遗传信息、病史和其他数据，制定个性化的治疗方案。这种方法有助于优化药物选择和剂量，从而提高治疗效果。", "人工智能加速了药物研发过程，通过分析大量数据发现新的药物靶点，优化药物化合物设计，以及预测药物的临床试验效果。"]
            ```
            示例问题：
            ```
            "讨论人工智能在医疗保健中的作用，特别是在诊断和治疗方面。"
            ```
            示例答案：
            ```
            "人工智能在诊断方面，可以分析医学图像（如X光片、CT扫描和MRI），帮助医生更准确地识别疾病。例如，AI可以通过深度学习模型检测早期癌症迹象，从而提高早期诊断率。"
            ```
            示例 JSON:
            ```
            {{
                "feedback": "该回答内容在上下文范围内，但它针对问题只进行了部分回答，存在漏答(没有回答人工智能在治疗方面的作用)。",
                "score": 0.5
            }}
            ```
            -----


            上下文：
            ```
            {retrieval_context}
            ```

            问题：
            ```
            {question}
            ```

            答案：
            ```
            {answer}
            ```

            JSON:
            """
        else:
            return f"""Task: Based on the given context and question, evaluate the quality of the associated answer, assuming sufficient domain knowledge. Use the following criteria to guide your evaluation:
            1. **Concise and clear**: Does the answer directly respond to the question? It should be strongly relevant to the question, avoiding off-topic responses.
            2. **Complete and accurate**: Does the answer completely and accurately respond to the question? It should avoid answer noise or incomplete responses.

            Based on these criteria, provide a score between 0 and 1, where:
            - "1" indicates the answer is concise and completely accurate compared to the question.
            - "0" indicates the answer is redundant, has missing information, or is off-topic.
            - Scores between 0 and 1 indicate partial clarity or answerability, meeting some but not all criteria.

            Input: Context (a list of strings), Question (string), Answer (string)

            Output format: A JSON object containing 'score' and 'feedback' keys:
            1. `score`: Quality score, must be a float between 0 and 1.
            2. `feedback`: Reason or feedback, must be a string

            Example context:
            ```
            ["Python is a widely used scripting language. Scripting languages are typically used for automating tasks, rapid development, and simplifying program design.", "Its advantages include ease of learning and use, rapid development, cross-platform compatibility, dynamic typing, rich libraries and frameworks, and good integration capabilities.", "However, scripting languages also have some disadvantages, such as lower performance, insufficient error checking, unsuitability for large projects, security issues, and environment dependencies."]
            ```
            Example question:
            ```
            "What are the advantages and disadvantages of Python as a scripting language?"
            ```
            Example answer:
            ```
            "Python's advantages include ease of learning and use, rapid development, cross-platform compatibility, dynamic typing, rich libraries and frameworks, and good integration capabilities. Disadvantages include lower performance, insufficient error checking, unsuitability for large projects, security issues, and environment dependencies."
            ```
            Example JSON:
            ```
            {{
                "feedback": "The answer clearly addresses the question, and the content is completely within the context scope, with no missing or incorrect answers.",
                "score": 1.0
            }}
            ```

            Example context:
            ```
            ["The education environment centered on 'love' and 'respect' in America has created thousands of self-centered individualists.", "The school district system for public schools and the annual tuition of $50,000-60,000 for private schools discourage many families. Without superior economic conditions, children don't even have the opportunity to receive a good education."]
            ```
            Example question:
            ```
            "What are the main criticisms of the current U.S. education system?"
            ```
            Example answer:
            ```
            "The main criticisms of the current U.S. education system include:

            1. Weak foundational education

            U.S. elementary and secondary education generally remains at a very basic level, especially in science education, with some students not encountering linear equations until high school. Many people don't start learning foreign languages until high school either.

            2. Widespread individualism

            The education environment centered on 'love' and 'respect' in America has created thousands of self-centered individualists.

            3. High education costs

            The school district system for public schools and the annual tuition of $50,000-60,000 for private schools discourage many families. Without superior economic conditions, children don't even have the opportunity to receive a good education."
            ```
            Example JSON:

            ```
            {{
                "feedback": "The answer clearly addresses the question without missing or incorrect answers, but the response content exceeds the context scope ('weak foundational education' is not mentioned in the context).",
                "score": 0.6
            }}
            ```


            Example context:
            ```
            ["Germany has long been committed to energy transition, and the new version of the Renewable Energy Act (EEG2021) that came into effect in 2021 is of great significance. The bill was passed by parliament on December 17, 2020, with the goal of further accelerating renewable energy development while reducing the burden on electricity users.", "The impact of renewable energy policies on Germany's local economy in 2021 was mainly in the following two aspects: 1. Renewable energy industry expansion: Under policy promotion, Germany's renewable energy industry continued to expand in 2021. Taking the solar photovoltaic industry as an example, EEG2021's plan to significantly increase photovoltaic power generation stimulated related companies to expand production scale and increase R&D investment", "2. Increased employment opportunities: The development of the renewable energy industry created a large number of job opportunities. Direct employment positions covered multiple links from energy equipment manufacturing, project construction, to later operation and maintenance."]
            ```
            Example question:
            ```
            "Explain the impact of renewable energy policies on Germany's local economy in 2021."
            ```
            Example answer:
            ```
            "The German government invested significant funds in subsidies and project support to promote renewable energy development. Although EEG2021 plans to gradually transition to market-driven approaches, it still required substantial fiscal funding support in 2021."
            ```
            Example JSON:
            ```
            {{
                "feedback": "The answer does not clearly address the question and is off-topic (the question asks about impact on local economy, but the answer discusses funding requirements). Additionally, the response content exceeds the context scope ('requires substantial fiscal funding support' is not mentioned in the context).",
                "score": 0.0
            }}
            ```

            Example context:
            ```
            ["Artificial intelligence algorithms can analyze medical images (such as X-rays, CT scans, and MRIs) to help doctors more accurately identify diseases. For example, AI can detect early signs of cancer through deep learning models, thereby improving early diagnosis rates.", "AI can develop personalized treatment plans based on patients' genetic information, medical history, and other data. This approach helps optimize drug selection and dosage, thereby improving treatment effectiveness.", "Artificial intelligence accelerates the drug development process by analyzing large amounts of data to discover new drug targets, optimize drug compound design, and predict clinical trial effects."]
            ```
            Example question:
            ```
            "Discuss the role of artificial intelligence in healthcare, particularly in diagnostics and treatment."
            ```
            Example answer:
            ```
            "In diagnostics, artificial intelligence can analyze medical images (such as X-rays, CT scans, and MRIs) to help doctors more accurately identify diseases. For example, AI can detect early signs of cancer through deep learning models, thereby improving early diagnosis rates."
            ```
            Example JSON:
            ```
            {{
                "feedback": "The answer content is within the context scope, but it only partially addresses the question, with missing answers (does not address the role of artificial intelligence in treatment).",
                "score": 0.5
            }}
            ```
            -----


            Context:
            ```
            {retrieval_context}
            ```

            Question:
            ```
            {question}
            ```

            Answer:
            ```
            {answer}
            ```

            JSON:
            """
