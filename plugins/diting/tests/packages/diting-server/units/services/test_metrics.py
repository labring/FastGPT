#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from unittest.mock import patch, MagicMock
from diting_server.services.evaluation.metrics import (
    discover_metrics,
    MetricFactory,
    _diting_metric_module_name,
)
import unittest


class TestDiscoverMetrics:
    """Test cases for discover_metrics function."""

    @patch("diting_server.services.evaluation.metrics.importlib.import_module")
    @patch("diting_server.services.evaluation.metrics.pkgutil.walk_packages")
    def test_discover_metrics_success(self, mock_walk_packages, mock_import_module):
        """Test successful metrics discovery."""
        # Mock base module
        mock_base_module = MagicMock()
        mock_base_module.__path__ = ["/path/to/module"]

        # Mock metric class
        mock_metric_class = MagicMock()
        mock_metric_class.__name__ = "TestMetric"
        mock_metric_class.__abstractmethods__ = set()  # Not abstract

        # Mock module attributes
        mock_base_module.__dir__ = MagicMock(return_value=["TestMetric"])
        mock_base_module.TestMetric = mock_metric_class

        mock_import_module.return_value = mock_base_module
        mock_walk_packages.return_value = []

        result = discover_metrics()

        assert isinstance(result, dict)
        mock_import_module.assert_called_once_with(_diting_metric_module_name)

    @patch("diting_server.services.evaluation.metrics.importlib.import_module")
    def test_discover_metrics_import_error(self, mock_import_module):
        """Test metrics discovery with import error."""
        mock_import_module.side_effect = ImportError("Module not found")

        result = discover_metrics()

        assert result == {}

    @patch("diting_server.services.evaluation.metrics.importlib.import_module")
    @patch("diting_server.services.evaluation.metrics.pkgutil.walk_packages")
    def test_discover_metrics_with_submodules(
        self, mock_walk_packages, mock_import_module
    ):
        """Test metrics discovery with submodules."""
        # Mock base module
        mock_base_module = MagicMock()
        mock_base_module.__path__ = ["/path/to/module"]
        mock_base_module.__dir__ = MagicMock(return_value=[])

        # Mock submodule
        mock_submodule = MagicMock()
        mock_metric_class = MagicMock()
        mock_metric_class.__name__ = "SubMetric"
        mock_metric_class.__abstractmethods__ = set()

        mock_submodule.__dir__ = MagicMock(return_value=["SubMetric"])
        mock_submodule.SubMetric = mock_metric_class

        # Mock walk_packages
        mock_module_info = MagicMock()
        mock_module_info.name = "diting_core.metrics.submodule"
        mock_walk_packages.return_value = [mock_module_info]

        mock_import_module.side_effect = [mock_base_module, mock_submodule]

        result = discover_metrics()

        assert isinstance(result, dict)

    @patch("diting_server.services.evaluation.metrics.importlib.import_module")
    @patch("diting_server.services.evaluation.metrics.pkgutil.walk_packages")
    def test_discover_metrics_include_abstract(
        self, mock_walk_packages, mock_import_module
    ):
        """Test metrics discovery including abstract classes."""
        # Mock base module
        mock_base_module = MagicMock()
        mock_base_module.__path__ = ["/path/to/module"]

        # Mock abstract metric class
        mock_abstract_metric = MagicMock()
        mock_abstract_metric.__name__ = "AbstractMetric"
        mock_abstract_metric.__abstractmethods__ = {"abstract_method"}

        # Mock concrete metric class
        mock_concrete_metric = MagicMock()
        mock_concrete_metric.__name__ = "ConcreteMetric"
        mock_concrete_metric.__abstractmethods__ = set()

        mock_base_module.__dir__ = MagicMock(
            return_value=["AbstractMetric", "ConcreteMetric"]
        )
        mock_base_module.AbstractMetric = mock_abstract_metric
        mock_base_module.ConcreteMetric = mock_concrete_metric

        mock_import_module.return_value = mock_base_module
        mock_walk_packages.return_value = []

        # Test with include_abstract=True
        result_with_abstract = discover_metrics(include_abstract=True)
        assert isinstance(result_with_abstract, dict)

        # Test with include_abstract=False (default)
        result_without_abstract = discover_metrics(include_abstract=False)
        assert isinstance(result_without_abstract, dict)

    @patch("diting_server.services.evaluation.metrics.importlib.import_module")
    def test_discover_metrics_non_recursive(self, mock_import_module):
        """Test metrics discovery without recursive search."""
        # Mock base module
        mock_base_module = MagicMock()
        mock_base_module.__path__ = ["/path/to/module"]
        mock_base_module.__dir__ = MagicMock(return_value=[])

        mock_import_module.return_value = mock_base_module

        result = discover_metrics(recursive=False)

        assert isinstance(result, dict)
        # Should not call walk_packages when recursive=False
        mock_import_module.assert_called_once_with(_diting_metric_module_name)


class TestMetricFactory(unittest.TestCase):
    """Test cases for MetricFactory class."""

    def test_init(self):
        """Test MetricFactory initialization."""
        with patch(
            "diting_server.services.evaluation.metrics.discover_metrics"
        ) as mock_discover:
            mock_metric = MagicMock()
            mock_discover.return_value = {"test_metric": mock_metric}
            factory = MetricFactory()

            # Use the same mock object reference for comparison
            self.assertEqual(factory.metrics, {"test_metric": mock_metric})
            mock_discover.assert_called_once()

    def test_create_existing_metric(self):
        """Test creating an existing metric."""
        mock_metric_class = MagicMock()
        mock_metrics = {"test_metric": mock_metric_class}

        with patch(
            "diting_server.services.evaluation.metrics.discover_metrics"
        ) as mock_discover:
            mock_discover.return_value = mock_metrics
            factory = MetricFactory()

            result = factory.create("test_metric")
            self.assertEqual(result, mock_metric_class)

    def test_create_nonexistent_metric(self):
        """Test creating a non-existent metric."""
        mock_metrics = {"existing_metric": MagicMock()}

        with patch(
            "diting_server.services.evaluation.metrics.discover_metrics"
        ) as mock_discover:
            mock_discover.return_value = mock_metrics
            factory = MetricFactory()

            with self.assertRaises(
                ValueError, msg="Unknown metric type: nonexistent_metric"
            ):
                factory.create("nonexistent_metric")

    def test_create_with_empty_metrics(self):
        """Test creating metric with empty metrics dict."""
        with patch(
            "diting_server.services.evaluation.metrics.discover_metrics"
        ) as mock_discover:
            mock_discover.return_value = {}
            factory = MetricFactory()

            with self.assertRaises(ValueError, msg="Unknown metric type: any_metric"):
                factory.create("any_metric")

    def test_create_multiple_metrics(self):
        """Test creating multiple different metrics."""
        mock_metric1 = MagicMock()
        mock_metric2 = MagicMock()
        mock_metrics = {"metric1": mock_metric1, "metric2": mock_metric2}

        with patch(
            "diting_server.services.evaluation.metrics.discover_metrics"
        ) as mock_discover:
            mock_discover.return_value = mock_metrics
            factory = MetricFactory()

            result1 = factory.create("metric1")
            result2 = factory.create("metric2")

            self.assertEqual(result1, mock_metric1)
            self.assertEqual(result2, mock_metric2)

    def test_create_case_sensitivity(self):
        """Test that metric creation is case sensitive."""
        mock_metric_class = MagicMock()
        mock_metrics = {"TestMetric": mock_metric_class}

        with patch(
            "diting_server.services.evaluation.metrics.discover_metrics"
        ) as mock_discover:
            mock_discover.return_value = mock_metrics
            factory = MetricFactory()

            # Should work with exact case
            result = factory.create("TestMetric")
            self.assertEqual(result, mock_metric_class)

            # Should fail with different case
            with self.assertRaises(ValueError, msg="Unknown metric type: testmetric"):
                factory.create("testmetric")
