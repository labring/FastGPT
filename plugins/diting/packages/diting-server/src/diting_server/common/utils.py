import os
from urllib.parse import urlparse
from typing import Any, List, Optional
from diting_server.common.schema import Usage, ModelType


def compute_token_usage(llm_usages: List[Any], embed_usages: List[Any]) -> List[Usage]:
    usages: List[Usage] = []

    # Embedding token
    if embed_usages:
        prompt_tokens = sum(u.prompt_tokens for u in embed_usages)
        completion_tokens = sum(
            getattr(u, "completion_tokens", 0) for u in embed_usages
        )
        total_tokens = sum(u.total_tokens for u in embed_usages)
        usages.append(
            Usage(
                model_type=ModelType.EMBED,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
            )
        )

    # LLM token
    if llm_usages:
        prompt_tokens = sum(u.get("prompt_tokens", 0) for u in llm_usages)
        completion_tokens = sum(u.get("completion_tokens", 0) for u in llm_usages)
        total_tokens = sum(u.get("total_tokens", 0) for u in llm_usages)
        usages.append(
            Usage(
                model_type=ModelType.LLM,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
            )
        )

    return usages


def resolve_model_config(
    model: str, base_url: Optional[str] = None, api_key: Optional[str] = None
) -> dict[str, Any]:
    if not base_url and not api_key:
        endpoint = os.getenv("AIPROXY_API_ENDPOINT")
        if endpoint is None:
            raise ValueError("AIPROXY_API_ENDPOINT is not set")
        base_url = endpoint.rstrip("/") + "/v1"

        token = os.getenv("AIPROXY_API_TOKEN")
        if token is None:
            raise ValueError("AIPROXY_API_TOKEN is not set")
        api_key = token

    if base_url:
        parsed = urlparse(base_url)
        if parsed.path and parsed.path != "/v1":
            if "/v1" in parsed.path:
                base_url = f"{parsed.scheme}://{parsed.netloc}/v1"
            else:
                base_url = (
                    f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")
                    + "/v1"
                )

    return {"model": model, "base_url": base_url, "api_key": api_key}
