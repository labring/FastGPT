import pkgutil
import importlib
from typing import Dict, Type

from diting_core.synthesis.base_synthesizer import BaseSynthesizer
from diting_core.utilities.slug import camel_to_snake
from pydantic import BaseModel, Field

_diting_synthesizer_module_name = "diting_core.synthesis"


class SynthesizerSchema(BaseModel):
    name: str = Field(..., description="Synthesizer name")


def discover_synthesizers(
    base_module_name: str = _diting_synthesizer_module_name,
    recursive: bool = True,
) -> Dict[str, Type[BaseSynthesizer]]:
    """
    Synthesizers discovery with additional options.

    Args:
        base_module_name: The base module name to search for synthesizers
        recursive: Whether to search submodules recursively

    Returns:
        Dict mapping synthesizer class names to their corresponding classes
    """
    synthesizers: Dict[str, Type[BaseSynthesizer]] = {}

    def _is_valid_synthesizer_class(cls):  # type: ignore
        """Check if a class is a valid synthesizer class."""
        if not isinstance(cls, type):
            return False
        if not issubclass(cls, BaseSynthesizer):
            return False
        if cls is BaseSynthesizer:
            return False
        return True

    try:
        base_module = importlib.import_module(base_module_name)

        # Check the base module itself
        for attr_name in dir(base_module):
            attr = getattr(base_module, attr_name)
            if _is_valid_synthesizer_class(attr):
                synthesizers[camel_to_snake(attr.__name__)] = attr

        # Search submodules if recursive
        if recursive:
            for module_info in pkgutil.walk_packages(
                base_module.__path__, prefix=f"{base_module_name}."
            ):
                try:
                    module = importlib.import_module(module_info.name)
                    for attr_name in dir(module):
                        attr = getattr(module, attr_name)
                        if _is_valid_synthesizer_class(attr):
                            synthesizers[camel_to_snake(attr.__name__)] = attr

                except ImportError as e:
                    print(f"Warning: Could not import {module_info.name}: {e}")
                    continue

    except ImportError as e:
        print(f"Error: Could not import base module {base_module_name}: {e}")
        return {}

    return synthesizers


class SynthesizerFactory:
    def __init__(self):
        self.synthesizers: Dict[str, Type[BaseSynthesizer]] = discover_synthesizers()

    def create(self, synthesizer_type: str) -> Type[BaseSynthesizer]:
        if synthesizer_type in self.synthesizers:
            return self.synthesizers[synthesizer_type]
        else:
            raise ValueError(f"Unknown synthesizer type: {synthesizer_type}")
