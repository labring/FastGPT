# -*- coding: utf-8 -*-

from typing import Any

from ..utils import calculate_metrics


def calculate_ex(predicted_res: list[tuple[Any, ...]], ground_truth_res: list[tuple[Any, ...]]) -> int:
    res = 0
    if set(predicted_res) == set(ground_truth_res):
        res = 1
    return res


def calculate_row_match(
    predicted_row: tuple[Any, ...], ground_truth_row: tuple[Any, ...]
) -> tuple[float, float, float]:
    """
    Calculate the matching percentage for a single row.

    Args:
    predicted_row (tuple): The predicted row values.
    ground_truth_row (tuple): The actual row values from ground truth.

    Returns:
    float: The match percentage (0 to 1 scale).
    """
    total_columns = len(ground_truth_row)
    matches = 0
    element_in_pred_only = 0
    element_in_truth_only = 0
    for pred_val in predicted_row:
        if pred_val in ground_truth_row:
            matches += 1
        else:
            element_in_pred_only += 1
    for truth_val in ground_truth_row:
        if truth_val not in predicted_row:
            element_in_truth_only += 1
    match_percentage = matches / total_columns
    pred_only_percentage = element_in_pred_only / total_columns
    truth_only_percentage = element_in_truth_only / total_columns
    return match_percentage, pred_only_percentage, truth_only_percentage


def calculate_f1(
    predicted: list[tuple[Any, ...]], ground_truth: list[tuple[Any, ...]]
) -> tuple[float, float, float]:
    """
    Calculate the F1 score based on sets of predicted results and ground truth results,
    where each element (tuple) represents a row from the database with multiple columns.

    Args:
    predicted (set of tuples): Predicted results from SQL query.
    ground_truth (set of tuples): Actual results expected (ground truth).

    Returns:
    float: The calculated F1 score.
    """
    # if both predicted and ground_truth are empty, return 1.0 for f1_score
    if not predicted and not ground_truth:
        return 1.0, 1.0, 1.0

    # Calculate matching scores for each possible pair
    match_scores: list[float] = []
    pred_only_scores: list[float] = []
    truth_only_scores: list[float] = []
    for i, gt_row in enumerate(ground_truth):
        # rows only in the ground truth results
        if i >= len(predicted):
            match_scores.append(0)
            truth_only_scores.append(1)
            continue
        pred_row = predicted[i]
        match_score, pred_only_score, truth_only_score = calculate_row_match(pred_row, gt_row)
        match_scores.append(match_score)
        pred_only_scores.append(pred_only_score)
        truth_only_scores.append(truth_only_score)

    # rows only in the predicted results
    for i in range(len(predicted) - len(ground_truth)):
        match_scores.append(0)
        pred_only_scores.append(1)
        truth_only_scores.append(0)

    tp = sum(match_scores)
    fp = sum(pred_only_scores)
    fn = sum(truth_only_scores)

    precision, recall, f1_score = calculate_metrics(tp, fp, fn)
    return precision, recall, f1_score

def calculate_ves(
    predicted_res: list[tuple[Any, ...]],
    ground_truth_res: list[tuple[Any, ...]],
    pred_cost_time:float,
    ground_truth_cost_time:float
):
    time_ratio = 0
    if set(predicted_res) == set(ground_truth_res):
        time_ratio = ground_truth_cost_time/pred_cost_time

    if time_ratio == 0:
        reward = 0
    elif time_ratio >= 2:
        reward = 1.25
    elif 1 <= time_ratio < 2:
        reward = 1
    elif 0.5 <= time_ratio < 1:
        reward = 0.75
    elif 0.25 <= time_ratio < 0.5:
        reward = 0.5
    else:
        reward = 0.25
    return reward
