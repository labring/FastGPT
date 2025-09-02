#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import pytest
from pydantic import ValidationError
from diting_server.common.schema import (
    to_camel,
    BaseSchema,
    SchemaBase,
    ModelType,
    StatusEnum,
    Usage,
)


class TestToCamel:
    """Test cases for to_camel function."""

    def test_simple_snake_case(self):
        """Test simple snake_case to camelCase conversion."""
        assert to_camel("hello_world") == "helloWorld"
        assert to_camel("user_name") == "userName"
        assert to_camel("api_key") == "apiKey"

    def test_multiple_underscores(self):
        """Test conversion with multiple underscores."""
        assert to_camel("hello_world_test") == "helloWorldTest"
        assert to_camel("user_profile_data") == "userProfileData"

    def test_single_word(self):
        """Test single word (no underscores)."""
        assert to_camel("hello") == "hello"
        assert to_camel("world") == "world"

    def test_empty_string(self):
        """Test empty string."""
        assert to_camel("") == ""

    def test_already_camel_case(self):
        """Test strings that are already in camelCase."""
        assert to_camel("helloWorld") == "helloWorld"
        assert to_camel("userName") == "userName"

    def test_mixed_case(self):
        """Test mixed case strings."""
        assert to_camel("Hello_World") == "HelloWorld"
        assert to_camel("User_Name") == "UserName"


class TestBaseSchema:
    """Test cases for BaseSchema class."""

    def test_base_schema_creation(self):
        """Test BaseSchema can be created with valid data."""

        class TestSchema(BaseSchema):
            user_name: str
            api_key: str

        schema = TestSchema(userName="test_user", apiKey="test_key")
        assert schema.user_name == "test_user"
        assert schema.api_key == "test_key"

    def test_camel_case_alias(self):
        """Test that camelCase aliases work correctly."""

        class TestSchema(BaseSchema):
            user_name: str
            api_key: str

        # Should accept both snake_case and camelCase
        schema1 = TestSchema(user_name="test_user", api_key="test_key")
        schema2 = TestSchema(userName="test_user", apiKey="test_key")

        assert schema1.user_name == schema2.user_name
        assert schema1.api_key == schema2.api_key

    def test_extra_fields_forbidden(self):
        """Test that extra fields are forbidden by default."""

        class TestSchema(BaseSchema):
            user_name: str

        with pytest.raises(ValidationError):
            TestSchema(user_name="test", extra_field="not_allowed")

    def test_from_attributes_enabled(self):
        """Test that from_attributes is enabled."""

        class TestSchema(BaseSchema):
            user_name: str

        # This should work with from_attributes=True
        class TestObject:
            def __init__(self):
                self.user_name = "test_user"

        obj = TestObject()
        schema = TestSchema.model_validate(obj)
        assert schema.user_name == "test_user"


class TestSchemaBase:
    """Test cases for SchemaBase class."""

    def test_schema_base_creation(self):
        """Test SchemaBase can be created."""

        class TestSchema(SchemaBase):
            status: str

        schema = TestSchema(status="active")
        assert schema.status == "active"

    def test_use_enum_values(self):
        """Test that use_enum_values is enabled."""

        class TestSchema(SchemaBase):
            status: StatusEnum

        schema = TestSchema(status=StatusEnum.SUCCESS)
        # Should use enum value, not enum object
        assert schema.status == "success"


class TestModelType:
    """Test cases for ModelType enum."""

    def test_model_type_values(self):
        """Test ModelType enum values."""
        assert ModelType.LLM == "llm"
        assert ModelType.EMBED == "embed"

    def test_model_type_string_enum(self):
        """Test that ModelType is a string enum."""
        assert isinstance(ModelType.LLM, str)
        assert isinstance(ModelType.EMBED, str)

    def test_model_type_comparison(self):
        """Test ModelType comparison."""
        assert ModelType.LLM == "llm"
        assert ModelType.EMBED == "embed"
        assert ModelType.LLM != ModelType.EMBED


class TestStatusEnum:
    """Test cases for StatusEnum enum."""

    def test_status_enum_values(self):
        """Test StatusEnum values."""
        assert StatusEnum.SUCCESS == "success"
        assert StatusEnum.FAILED == "failed"

    def test_status_enum_string_enum(self):
        """Test that StatusEnum is a string enum."""
        assert isinstance(StatusEnum.SUCCESS, str)
        assert isinstance(StatusEnum.FAILED, str)

    def test_status_enum_comparison(self):
        """Test StatusEnum comparison."""
        assert StatusEnum.SUCCESS == "success"
        assert StatusEnum.FAILED == "failed"
        assert StatusEnum.SUCCESS != StatusEnum.FAILED


class TestUsage:
    """Test cases for Usage class."""

    def test_usage_creation_required_fields(self):
        """Test Usage creation with required fields."""
        usage = Usage(model_type=ModelType.LLM)
        assert usage.model_type == ModelType.LLM
        assert usage.prompt_tokens is None
        assert usage.completion_tokens is None
        assert usage.total_tokens is None

    def test_usage_creation_all_fields(self):
        """Test Usage creation with all fields."""
        usage = Usage(
            model_type=ModelType.LLM,
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
        )
        assert usage.model_type == ModelType.LLM
        assert usage.prompt_tokens == 100
        assert usage.completion_tokens == 50
        assert usage.total_tokens == 150

    def test_usage_with_embed_model(self):
        """Test Usage with embedding model."""
        usage = Usage(model_type=ModelType.EMBED, prompt_tokens=200, total_tokens=200)
        assert usage.model_type == ModelType.EMBED
        assert usage.prompt_tokens == 200
        assert usage.total_tokens == 200

    def test_usage_camel_case_alias(self):
        """Test Usage with camelCase aliases."""
        usage = Usage(
            modelType=ModelType.LLM,
            promptTokens=100,
            completionTokens=50,
            totalTokens=150,
        )
        assert usage.model_type == ModelType.LLM
        assert usage.prompt_tokens == 100
        assert usage.completion_tokens == 50
        assert usage.total_tokens == 150

    def test_usage_validation(self):
        """Test Usage field validation."""
        # Valid usage
        usage = Usage(model_type=ModelType.LLM, prompt_tokens=0)
        assert usage.prompt_tokens == 0

        # Test with negative values (should be allowed as they're Optional[int])
        usage = Usage(model_type=ModelType.LLM, prompt_tokens=-1)
        assert usage.prompt_tokens == -1

    def test_usage_serialization(self):
        """Test Usage serialization."""
        usage = Usage(
            model_type=ModelType.LLM,
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
        )

        # Test dict conversion
        usage_dict = usage.model_dump()
        expected = {
            "model_type": "llm",
            "prompt_tokens": 100,
            "completion_tokens": 50,
            "total_tokens": 150,
        }
        assert usage_dict == expected

        # Test camelCase serialization
        usage_dict_camel = usage.model_dump(by_alias=True)
        expected_camel = {
            "modelType": "llm",
            "promptTokens": 100,
            "completionTokens": 50,
            "totalTokens": 150,
        }
        assert usage_dict_camel == expected_camel
