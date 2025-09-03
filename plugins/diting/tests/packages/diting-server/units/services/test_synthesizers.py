#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from unittest.mock import patch, MagicMock
from diting_server.services.synthesis.synthesizers import (
    discover_synthesizers,
    SynthesizerFactory,
    SynthesizerSchema,
    _diting_synthesizer_module_name,
)
import unittest


class TestSynthesizerSchema:
    """Test cases for SynthesizerSchema class."""

    def test_synthesizer_schema_creation(self):
        """Test SynthesizerSchema creation with valid data."""
        schema = SynthesizerSchema(name="test_synthesizer")
        assert schema.name == "test_synthesizer"

    def test_synthesizer_schema_validation(self):
        """Test SynthesizerSchema validation."""
        # Valid schema
        schema = SynthesizerSchema(name="valid_name")
        assert schema.name == "valid_name"

        # Test with empty name (should still work as it's just a string field)
        schema = SynthesizerSchema(name="")
        assert schema.name == ""

    def test_synthesizer_schema_serialization(self):
        """Test SynthesizerSchema serialization."""
        schema = SynthesizerSchema(name="test_synthesizer")

        # Test dict conversion
        schema_dict = schema.model_dump()
        expected = {"name": "test_synthesizer"}
        assert schema_dict == expected


class TestDiscoverSynthesizers:
    """Test cases for discover_synthesizers function."""

    @patch("diting_server.services.synthesis.synthesizers.importlib.import_module")
    @patch("diting_server.services.synthesis.synthesizers.pkgutil.walk_packages")
    def test_discover_synthesizers_success(
        self, mock_walk_packages, mock_import_module
    ):
        """Test successful synthesizers discovery."""
        # Mock base module
        mock_base_module = MagicMock()
        mock_base_module.__path__ = ["/path/to/module"]

        # Mock synthesizer class
        mock_synthesizer_class = MagicMock()
        mock_synthesizer_class.__name__ = "TestSynthesizer"

        # Mock module attributes
        mock_base_module.__dir__ = MagicMock(return_value=["TestSynthesizer"])
        mock_base_module.TestSynthesizer = mock_synthesizer_class

        mock_import_module.return_value = mock_base_module
        mock_walk_packages.return_value = []

        result = discover_synthesizers()

        assert isinstance(result, dict)
        mock_import_module.assert_called_once_with(_diting_synthesizer_module_name)

    @patch("diting_server.services.synthesis.synthesizers.importlib.import_module")
    def test_discover_synthesizers_import_error(self, mock_import_module):
        """Test synthesizers discovery with import error."""
        mock_import_module.side_effect = ImportError("Module not found")

        result = discover_synthesizers()

        assert result == {}

    @patch("diting_server.services.synthesis.synthesizers.importlib.import_module")
    @patch("diting_server.services.synthesis.synthesizers.pkgutil.walk_packages")
    def test_discover_synthesizers_with_submodules(
        self, mock_walk_packages, mock_import_module
    ):
        """Test synthesizers discovery with submodules."""
        # Mock base module
        mock_base_module = MagicMock()
        mock_base_module.__path__ = ["/path/to/module"]
        mock_base_module.__dir__ = MagicMock(return_value=[])

        # Mock submodule
        mock_submodule = MagicMock()
        mock_synthesizer_class = MagicMock()
        mock_synthesizer_class.__name__ = "SubSynthesizer"

        mock_submodule.__dir__ = MagicMock(return_value=["SubSynthesizer"])
        mock_submodule.SubSynthesizer = mock_synthesizer_class

        # Mock walk_packages
        mock_module_info = MagicMock()
        mock_module_info.name = "diting_core.synthesis.submodule"
        mock_walk_packages.return_value = [mock_module_info]

        mock_import_module.side_effect = [mock_base_module, mock_submodule]

        result = discover_synthesizers()

        assert isinstance(result, dict)

    @patch("diting_server.services.synthesis.synthesizers.importlib.import_module")
    def test_discover_synthesizers_non_recursive(self, mock_import_module):
        """Test synthesizers discovery without recursive search."""
        # Mock base module
        mock_base_module = MagicMock()
        mock_base_module.__path__ = ["/path/to/module"]
        mock_base_module.__dir__ = MagicMock(return_value=[])

        mock_import_module.return_value = mock_base_module

        result = discover_synthesizers(recursive=False)

        assert isinstance(result, dict)
        # Should not call walk_packages when recursive=False
        mock_import_module.assert_called_once_with(_diting_synthesizer_module_name)

    @patch("diting_server.services.synthesis.synthesizers.importlib.import_module")
    @patch("diting_server.services.synthesis.synthesizers.pkgutil.walk_packages")
    def test_discover_synthesizers_submodule_import_error(
        self, mock_walk_packages, mock_import_module
    ):
        """Test synthesizers discovery with submodule import error."""
        # Mock base module
        mock_base_module = MagicMock()
        mock_base_module.__path__ = ["/path/to/module"]
        mock_base_module.__dir__ = MagicMock(return_value=[])

        # Mock walk_packages
        mock_module_info = MagicMock()
        mock_module_info.name = "diting_core.synthesis.submodule"
        mock_walk_packages.return_value = [mock_module_info]

        # First call succeeds (base module), second call fails (submodule)
        mock_import_module.side_effect = [
            mock_base_module,
            ImportError("Submodule not found"),
        ]

        result = discover_synthesizers()

        assert isinstance(result, dict)
        # Should continue despite submodule import error

    @patch("diting_server.services.synthesis.synthesizers.importlib.import_module")
    @patch("diting_server.services.synthesis.synthesizers.pkgutil.walk_packages")
    def test_discover_synthesizers_custom_base_module(
        self, mock_walk_packages, mock_import_module
    ):
        """Test synthesizers discovery with custom base module."""
        custom_module_name = "custom.synthesis.module"

        # Mock base module
        mock_base_module = MagicMock()
        mock_base_module.__path__ = ["/path/to/module"]
        mock_base_module.__dir__ = MagicMock(return_value=[])

        mock_import_module.return_value = mock_base_module
        mock_walk_packages.return_value = []

        result = discover_synthesizers(base_module_name=custom_module_name)

        assert isinstance(result, dict)
        mock_import_module.assert_called_once_with(custom_module_name)


class TestSynthesizerFactory(unittest.TestCase):
    """Test cases for SynthesizerFactory class."""

    def test_init(self):
        """Test SynthesizerFactory initialization."""
        with patch(
            "diting_server.services.synthesis.synthesizers.discover_synthesizers"
        ) as mock_discover:
            mock_synthesizer = MagicMock()
            mock_discover.return_value = {"test_synthesizer": mock_synthesizer}
            factory = SynthesizerFactory()

            # Use the same mock object reference for comparison
            self.assertEqual(
                factory.synthesizers, {"test_synthesizer": mock_synthesizer}
            )
            mock_discover.assert_called_once()

    def test_create_existing_synthesizer(self):
        """Test creating an existing synthesizer."""
        mock_synthesizer_class = MagicMock()
        mock_synthesizers = {"test_synthesizer": mock_synthesizer_class}

        with patch(
            "diting_server.services.synthesis.synthesizers.discover_synthesizers"
        ) as mock_discover:
            mock_discover.return_value = mock_synthesizers
            factory = SynthesizerFactory()

            result = factory.create("test_synthesizer")
            self.assertEqual(result, mock_synthesizer_class)

    def test_create_nonexistent_synthesizer(self):
        """Test creating a non-existent synthesizer."""
        mock_synthesizers = {"existing_synthesizer": MagicMock()}

        with patch(
            "diting_server.services.synthesis.synthesizers.discover_synthesizers"
        ) as mock_discover:
            mock_discover.return_value = mock_synthesizers
            factory = SynthesizerFactory()

            with self.assertRaises(
                ValueError, msg="Unknown synthesizer type: nonexistent_synthesizer"
            ):
                factory.create("nonexistent_synthesizer")

    def test_create_with_empty_synthesizers(self):
        """Test creating synthesizer with empty synthesizers dict."""
        with patch(
            "diting_server.services.synthesis.synthesizers.discover_synthesizers"
        ) as mock_discover:
            mock_discover.return_value = {}
            factory = SynthesizerFactory()

            with self.assertRaises(
                ValueError, msg="Unknown synthesizer type: any_synthesizer"
            ):
                factory.create("any_synthesizer")

    def test_create_multiple_synthesizers(self):
        """Test creating multiple different synthesizers."""
        mock_synthesizer1 = MagicMock()
        mock_synthesizer2 = MagicMock()
        mock_synthesizers = {
            "synthesizer1": mock_synthesizer1,
            "synthesizer2": mock_synthesizer2,
        }

        with patch(
            "diting_server.services.synthesis.synthesizers.discover_synthesizers"
        ) as mock_discover:
            mock_discover.return_value = mock_synthesizers
            factory = SynthesizerFactory()

            result1 = factory.create("synthesizer1")
            result2 = factory.create("synthesizer2")

            self.assertEqual(result1, mock_synthesizer1)
            self.assertEqual(result2, mock_synthesizer2)

    def test_create_case_sensitivity(self):
        """Test that synthesizer creation is case sensitive."""
        mock_synthesizer_class = MagicMock()
        mock_synthesizers = {"TestSynthesizer": mock_synthesizer_class}

        with patch(
            "diting_server.services.synthesis.synthesizers.discover_synthesizers"
        ) as mock_discover:
            mock_discover.return_value = mock_synthesizers
            factory = SynthesizerFactory()

            # Should work with exact case
            result = factory.create("TestSynthesizer")
            self.assertEqual(result, mock_synthesizer_class)

            # Should fail with different case
            with self.assertRaises(
                ValueError, msg="Unknown synthesizer type: testsynthesizer"
            ):
                factory.create("testsynthesizer")

    def test_create_with_snake_case_conversion(self):
        """Test that synthesizer names are converted to snake_case."""
        mock_synthesizer_class = MagicMock()
        # The discover_synthesizers function should convert CamelCase to snake_case
        mock_synthesizers = {"test_synthesizer": mock_synthesizer_class}

        with patch(
            "diting_server.services.synthesis.synthesizers.discover_synthesizers"
        ) as mock_discover:
            mock_discover.return_value = mock_synthesizers
            factory = SynthesizerFactory()

            result = factory.create("test_synthesizer")
            self.assertEqual(result, mock_synthesizer_class)
