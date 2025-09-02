#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import unittest
from datetime import datetime
from fastapi.testclient import TestClient
from diting_server.apis.v1.healthz.api import router, health_check


class TestHealthCheck(unittest.IsolatedAsyncioTestCase):
    """Test cases for health check endpoint."""

    async def test_health_check_function(self):
        """Test health_check function directly."""
        result = await health_check()

        self.assertIsInstance(result, dict)
        self.assertIn("code", result)
        self.assertIn("msg", result)
        self.assertIn("data", result)

        self.assertEqual(result["code"], 200)
        self.assertEqual(result["msg"], "success")

        data = result["data"]
        self.assertEqual(data["version"], "v1")
        self.assertEqual(data["status"], "healthy")
        self.assertIn("timestamp", data)

        # Verify timestamp format
        timestamp = data["timestamp"]
        self.assertTrue(timestamp.endswith("Z"))
        # Try to parse the timestamp
        parsed_time = datetime.fromisoformat(timestamp[:-1])
        self.assertIsInstance(parsed_time, datetime)

    async def test_health_check_timestamp_format(self):
        """Test that timestamp is in correct ISO format."""
        result = await health_check()
        timestamp = result["data"]["timestamp"]

        # Should end with Z (UTC indicator)
        self.assertTrue(timestamp.endswith("Z"))

        # Should be parseable as ISO format
        iso_timestamp = timestamp[:-1]  # Remove Z
        parsed_time = datetime.fromisoformat(iso_timestamp)
        self.assertIsInstance(parsed_time, datetime)

    async def test_health_check_response_structure(self):
        """Test the complete response structure."""
        result = await health_check()

        # Top level structure
        self.assertEqual(set(result.keys()), {"code", "msg", "data"})

        # Data structure
        data = result["data"]
        self.assertEqual(set(data.keys()), {"version", "status", "timestamp"})

        # Value types
        self.assertIsInstance(result["code"], int)
        self.assertIsInstance(result["msg"], str)
        self.assertIsInstance(data["version"], str)
        self.assertIsInstance(data["status"], str)
        self.assertIsInstance(data["timestamp"], str)

    async def test_health_check_multiple_calls(self):
        """Test that multiple calls return consistent structure."""
        result1 = await health_check()
        result2 = await health_check()

        # Structure should be the same
        self.assertEqual(set(result1.keys()), set(result2.keys()))
        self.assertEqual(set(result1["data"].keys()), set(result2["data"].keys()))

        # Static values should be the same
        self.assertEqual(result1["code"], result2["code"])
        self.assertEqual(result1["msg"], result2["msg"])
        self.assertEqual(result1["data"]["version"], result2["data"]["version"])
        self.assertEqual(result1["data"]["status"], result2["data"]["status"])

        # Timestamps should be different (unless called at exact same time)
        # This is a weak test, but timestamps should be close
        timestamp1 = result1["data"]["timestamp"]
        timestamp2 = result2["data"]["timestamp"]

        time1 = datetime.fromisoformat(timestamp1[:-1])
        time2 = datetime.fromisoformat(timestamp2[:-1])

        # Time difference should be very small (less than 1 second)
        time_diff = abs((time2 - time1).total_seconds())
        self.assertLess(time_diff, 1.0)

    def test_health_check_router_inclusion(self):
        """Test that the router is properly configured."""
        # Check that router has the health check route
        routes = [route.path for route in router.routes]
        self.assertIn("/api/v1/healthz", routes)

        # Check that it's a GET route
        health_route = next(
            route for route in router.routes if route.path == "/api/v1/healthz"
        )
        self.assertIn("GET", [method for method in health_route.methods])

    def test_health_check_with_test_client(self):
        """Test health check endpoint using FastAPI TestClient."""
        from fastapi import FastAPI

        app = FastAPI()
        app.include_router(router)

        client = TestClient(app)
        response = client.get("/api/v1/healthz")

        self.assertEqual(response.status_code, 200)

        data = response.json()
        self.assertEqual(data["code"], 200)
        self.assertEqual(data["msg"], "success")
        self.assertEqual(data["data"]["version"], "v1")
        self.assertEqual(data["data"]["status"], "healthy")
        self.assertIn("timestamp", data["data"])

    def test_health_check_async_function(self):
        """Test that health_check is an async function."""
        import inspect

        # Check if the function is a coroutine function
        self.assertTrue(inspect.iscoroutinefunction(health_check))

    async def test_health_check_async_execution(self):
        """Test health_check as an async function."""
        result = await health_check()

        self.assertIsInstance(result, dict)
        self.assertEqual(result["code"], 200)
        self.assertEqual(result["msg"], "success")
        self.assertEqual(result["data"]["status"], "healthy")
