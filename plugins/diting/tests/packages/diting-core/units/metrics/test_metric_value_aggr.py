#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
from diting_core.metrics.metric_value_aggr import (
    MetricValueAggregator,
    MetricScoreScope,
)
from diting_core.metrics.base_metric import MetricValue


class TestMetricValueAggregator(unittest.TestCase):
    def setUp(self):
        """设置测试数据"""
        self.metrics = [
            MetricValue(metric_name="accuracy", score=0.9),
            MetricValue(metric_name="accuracy", score=0.85),
            MetricValue(metric_name="accuracy", score=0.95),
            MetricValue(metric_name="accuracy", score=0.4),
            MetricValue(metric_name="precision", score=0.6),
            MetricValue(metric_name="precision", score=0.7),
            MetricValue(metric_name="precision", score=0.8),
        ]
        self.aggregator = MetricValueAggregator(metric_values=self.metrics)

    def test_aggregate_mean(self):
        """测试聚合均值"""
        stats_to_calculate = ["mean"]
        result = self.aggregator.aggregate(stats_to_calculate)
        self.assertEqual(result["accuracy"]["mean"], 0.775)
        self.assertEqual(result["precision"]["mean"], 0.7)

    def test_aggregate_max(self):
        """测试聚合最大值"""
        stats_to_calculate = ["max"]
        result = self.aggregator.aggregate(stats_to_calculate)
        self.assertEqual(result["accuracy"]["max"], 0.95)
        self.assertEqual(result["precision"]["max"], 0.8)

    def test_aggregate_min(self):
        """测试聚合最小值"""
        stats_to_calculate = ["min"]
        result = self.aggregator.aggregate(stats_to_calculate)
        self.assertEqual(result["accuracy"]["min"], 0.4)
        self.assertEqual(result["precision"]["min"], 0.6)

    def test_aggregate_variance(self):
        """测试聚合方差"""
        stats_to_calculate = ["variance"]
        result = self.aggregator.aggregate(stats_to_calculate)
        self.assertAlmostEqual(result["accuracy"]["variance"], 0.06416666666666666)
        self.assertAlmostEqual(result["precision"]["variance"], 0.010000000000000007)

    def test_aggregate_median(self):
        """测试聚合中位数"""
        stats_to_calculate = ["median"]
        result = self.aggregator.aggregate(stats_to_calculate)
        self.assertEqual(result["accuracy"]["median"], 0.875)
        self.assertEqual(result["precision"]["median"], 0.7)

    def test_result_mapping(self):
        """测试结果映射"""
        mappings = {
            "accuracy": {
                "fail": MetricScoreScope(0, 0.5),
                "success": MetricScoreScope(0.5, 1),
            },
            "precision": {
                "low": MetricScoreScope(0, 0.7),
                "high": MetricScoreScope(0.7, 1),
            },
        }
        result = self.aggregator.result_mapping(mappings)
        self.assertEqual(result["accuracy"]["success"], "75.00%")
        self.assertEqual(result["precision"]["high"], "66.67%")
        self.assertEqual(result["precision"]["low"], "33.33%")

    def test_default_result_mapping(self):
        """测试结果映射"""
        self.aggregator.metric_values = [
            MetricValue(metric_name="answer_correctness", score=0.9),
            MetricValue(metric_name="answer_relevancy", score=0.85),
            MetricValue(metric_name="answer_similarity", score=0.95),
            MetricValue(metric_name="context_recall", score=0.4),
            MetricValue(metric_name="faithfulness", score=0.6),
            MetricValue(metric_name="q_a_quality", score=0.7),
            MetricValue(metric_name="q_a_quality", score=1.0),
        ]
        result = self.aggregator.result_mapping()
        self.assertEqual(result["answer_correctness"]["Qualified"], "100.00%")
        self.assertEqual(result["answer_relevancy"]["Qualified"], "100.00%")
        self.assertEqual(result["context_recall"]["UnQualified"], "100.00%")
        self.assertEqual(result["q_a_quality"]["UnQualified"], "50.00%")
        self.assertEqual(result["q_a_quality"]["Qualified"], "50.00%")

    def test_result_mapping_no_scores(self):
        """测试没有分数的情况"""
        empty_aggregator = MetricValueAggregator(metric_values=[])
        mappings = {
            "accuracy": {
                "fail": MetricScoreScope(0, 0.5),
                "success": MetricScoreScope(0.5, 1),
            },
        }
        result = empty_aggregator.result_mapping(mappings)
        self.assertEqual(result, {})

    def test_map_score_to_label(self):
        """测试分数映射到标签"""
        mapping = {
            "fail": MetricScoreScope(0, 0.5),
            "success": MetricScoreScope(0.5, 1),
        }
        label = self.aggregator.map_score_to_label(0.9, mapping)
        self.assertEqual(label, "success")
        label = self.aggregator.map_score_to_label(0.4, mapping)
        self.assertEqual(label, "fail")
        label = self.aggregator.map_score_to_label(1.1, mapping)
        self.assertIsNone(label)

    def test_scope_valid(self):
        with self.assertRaises(ValueError):
            MetricScoreScope(0.5, 0.5)
        with self.assertRaises(ValueError):
            MetricScoreScope(0.6, 0.1)


if __name__ == "__main__":
    unittest.main()
