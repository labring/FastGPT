#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
from unittest.mock import patch
from diting_server.config.settings import Settings, get_settings


class TestSettings(unittest.TestCase):
    """Test cases for Settings configuration class."""

    def test_default_settings(self):
        """Test default settings values."""
        settings = Settings()

        self.assertEqual(settings.environment, "Production")
        self.assertEqual(settings.log_level, "INFO")
        self.assertEqual(settings.log_format, "plain")
        self.assertEqual(settings.host, "0.0.0.0")
        self.assertEqual(settings.port, 3001)

    def test_custom_settings(self):
        """Test custom settings values."""
        settings = Settings(
            environment="Development",
            log_level="DEBUG",
            log_format="json",
            host="127.0.0.1",
            port=8080,
        )

        self.assertEqual(settings.environment, "Development")
        self.assertEqual(settings.log_level, "DEBUG")
        self.assertEqual(settings.log_format, "json")
        self.assertEqual(settings.host, "127.0.0.1")
        self.assertEqual(settings.port, 8080)

    def test_environment_validation(self):
        """Test environment field validation."""
        # Valid environments
        valid_environments = ["Development", "Test", "Production"]
        for env in valid_environments:
            settings = Settings(environment=env)
            self.assertEqual(settings.environment, env)

    def test_environment_invalid_value(self):
        """Test invalid environment value raises validation error."""
        with self.assertRaises(ValueError):
            Settings(environment="Invalid")

    def test_port_validation(self):
        """Test port field validation."""
        # Valid port
        settings = Settings(port=8080)
        self.assertEqual(settings.port, 8080)

        # Test with different port values
        settings = Settings(port=1)
        self.assertEqual(settings.port, 1)

        settings = Settings(port=65535)
        self.assertEqual(settings.port, 65535)

    def test_settings_mutability(self):
        """Test that settings can be modified."""
        settings = Settings()

        # Settings should be mutable
        original_environment = settings.environment
        settings.environment = "Development"
        self.assertEqual(settings.environment, "Development")

        # Restore original value
        settings.environment = original_environment
        self.assertEqual(settings.environment, original_environment)


class TestGetSettings(unittest.TestCase):
    """Test cases for get_settings function."""

    def test_get_settings_returns_settings_instance(self):
        """Test that get_settings returns a Settings instance."""
        settings = get_settings()
        self.assertIsInstance(settings, Settings)

    def test_get_settings_caching(self):
        """Test that get_settings uses lru_cache."""
        settings1 = get_settings()
        settings2 = get_settings()

        # Should return the same instance due to caching
        self.assertIs(settings1, settings2)

    def test_get_settings_with_environment_variables(self):
        """Test get_settings with environment variables."""
        # Clear cache first to ensure fresh settings
        get_settings.cache_clear()

        with patch.dict(
            "os.environ",
            {
                "ENVIRONMENT": "Test",
                "LOG_LEVEL": "WARNING",
                "LOG_FORMAT": "json",
                "HOST": "localhost",
                "PORT": "9000",
            },
        ):
            settings = get_settings()
            self.assertEqual(settings.environment, "Test")
            self.assertEqual(settings.log_level, "WARNING")
            self.assertEqual(settings.log_format, "json")
            self.assertEqual(settings.host, "localhost")
            self.assertEqual(settings.port, 9000)

    def test_get_settings_cache_clearing(self):
        """Test that cache can be cleared and new settings loaded."""
        # Get initial settings
        settings1 = get_settings()

        # Clear cache
        get_settings.cache_clear()

        # Get new settings
        settings2 = get_settings()

        # Should be different instances after cache clear
        self.assertIsNot(settings1, settings2)
