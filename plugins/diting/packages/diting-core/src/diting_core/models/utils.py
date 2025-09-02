import re


def deepseek_r1_filter_output(text: str) -> str:
    """
    deepseek-r1 模型移除 </think> 标签及其前置思考内容。

    Args:
        text (str): 模型输出的文本。

    Returns:
        str: 过滤后的文本。
    """
    return re.sub(r"^.*?</think>", "", text, flags=re.DOTALL, count=1).lstrip("\n")


def qwq_filter_output(text: str) -> str:
    """
    qwq 模型输出过滤和 deepseek-r1一致
    """
    return deepseek_r1_filter_output(text)


def filter_model_output(text: str, llm_type: str = "") -> str:
    if llm_type == "deepseek_r1":
        return deepseek_r1_filter_output(text)
    elif llm_type == "qwq":
        return qwq_filter_output(text)
    else:
        return deepseek_r1_filter_output(text)
