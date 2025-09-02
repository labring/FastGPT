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
