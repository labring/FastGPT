import re
from enum import Enum


class Language(Enum):
    CHINESE = "zh"
    ENGLISH = "en"


def detect_language(text: str) -> Language:
    # 只计算字母和汉字
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    english_chars = len(re.findall(r"[a-zA-Z]", text))

    total_meaningful = chinese_chars + english_chars
    if total_meaningful == 0:
        return Language.ENGLISH
    return (
        Language.CHINESE if chinese_chars / total_meaningful > 0.3 else Language.ENGLISH
    )


def fbeta_score(tp: int, fp: int, fn: int, beta: float = 1.0) -> float:
    if tp + fp == 0:
        precision: float = 0
    else:
        precision: float = tp / (tp + fp)

    if tp + fn == 0:
        recall: float = 0
    else:
        recall = tp / (tp + fn)

    if precision == 0 and recall == 0:
        return 0.0

    beta_squared: float = beta**2
    fbeta: float = (
        (1 + beta_squared)
        * (precision * recall)
        / ((beta_squared * precision) + recall)
    )

    return fbeta
