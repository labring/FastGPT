#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from typing import Optional

import openai
from diting_core.models.embeddings.base_model import BaseEmbeddings
from diting_core.models.embeddings.openai_model import PrivateEmbeddings


def embedding_factory(
    model: str = "bge-m3",
    base_url: Optional[str] = None,
    api_key: Optional[str] = None,
    timeout: Optional[float] = None,
) -> BaseEmbeddings:
    """
    Create and return a BaseEmbeddings instance. Used for default embeddings
    used in Diting.

    This factory function creates an Embeddings instance and wraps it with
    LangchainEmbeddingsWrapper to provide a BaseEmbeddings compatible object.

    Parameters
    ----------
    model : str
        The name of the embedding model to use (e.g. "bge-m3")
    base_url : str
        Base URL for the embedding API – useful for OpenAI, Azure, or custom endpoints.
    api_key : str
        API key for authenticating with the embedding service.
    timeout: float

    Returns
    -------
    BaseEmbeddings
        A LangChain-compatible embedding instance that supports both `.embed_*`
        and `.aembed_*` methods.
    """
    async_client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=timeout)
    openai_embeddings = PrivateEmbeddings(model=model, async_client=async_client)
    return openai_embeddings
