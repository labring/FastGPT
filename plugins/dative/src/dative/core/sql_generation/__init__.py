# -*- coding: utf-8 -*-

import asyncio
from json import JSONDecodeError
from typing import cast

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessageChunk, HumanMessage

from ..utils import cal_tokens, get_beijing_time, text2json

prompt_prefix = """
You are a helpful data analyst who is great at thinking deeply and reasoning about the user's question and the database schema.

## 1. Database info
{db_info}

## 2. Context Information
- Current Time: {current_time}. It is only used when calculation or conversion is required according to the current system time.

## 3. Constraints
- Generate an optimized SQL query that directly answers the user's question.
- The SQL query must be fully formed, valid, and executable.
- Do NOT include any explanations, markdown formatting, or comments.
- If you want the maximum or minimum value, do not limit it to 1.
- When you need to calculate the proportion or other indicators, please use double precision.

## 4. Evidence
{evidence}

## 5. QUESTION
User's Question: {user_query}
"""  # noqa: E501

generation_prompt = """
Respond in the following JSON format:
- If the user query is not related to the database, answer with empty string.
{{
    "answer": ""
}}
- If you can answer the questions based on the database schema and don't need to generate SQL, generate the answers directly.
{{
    "answer": "answer based on database schema"
}}
- If you need to answer the question by querying the database, please generate SQL, select only the necessary fields needed to answer the question, without any missing or extra information.
- Prefer using aggregate functions (such as COUNT, SUM, etc.) in SQL query and avoid returning redundant data for post-processing.
{{
    "sql": "Generated SQL query here"
}}
"""  # noqa: E501

correction_prompt = """
There is a SQL, but an error was reported after execution. Analyze why the given SQL query does not produce the correct results, identify the issues, and provide a corrected SQL query that properly answers the user's request.

- Current SQL Query: {current_sql}
- Error: {error}

**What You Need to Do:**
1. **Analyze:** Explain why the current SQL query fails to produce the correct results.
2. **Provide a Corrected SQL Query:** Write a revised query that returns the correct results.

Respond in the following JSON format:
{{
    "sql": "The corrected SQL query should be placed here."
}}
"""  # noqa: E501


async def arun(
    query: str,
    llm: BaseChatModel,
    db_info: str,
    evidence: str = "",
    error_sql: str | None = None,
    error_msg: str | None = None,
) -> tuple[str | None, str, int, int, str | None]:
    answer = None
    sql = ""
    error = None
    data = {
        "db_info": db_info,
        "user_query": query,
        "current_time": await asyncio.to_thread(get_beijing_time),
        "evidence": evidence or "",
    }
    input_tokens, output_tokens = 0, 0
    if not error_sql:
        prompt = prompt_prefix + generation_prompt
    else:
        assert error_msg, "error_msg is required when you need to correct sql"
        data["current_sql"] = error_sql
        data["error"] = error_msg
        prompt = prompt_prefix + correction_prompt
    try:
        content = ""
        async for chunk in llm.astream([HumanMessage(prompt.format(**data))]):
            msg = cast(AIMessageChunk, chunk)
            content += cast(str, msg.content)
            input_tokens, output_tokens = await asyncio.to_thread(cal_tokens, msg)
    except Exception as e:
        raise ValueError(f"调用LLM失败：{e}")

    if content.startswith("SELECT"):
        sql = content
    elif content.find("```sql") != -1:
        sql = content.split("```sql")[1].split("```")[0]
    else:
        try:
            result = await asyncio.to_thread(text2json, content)
            if "answer" in result:
                answer = result.get("answer") or ""
            else:
                sql = result.get("sql") or ""
        except JSONDecodeError:
            error = "Incorrect json format"

    return answer, sql, input_tokens, output_tokens, error
