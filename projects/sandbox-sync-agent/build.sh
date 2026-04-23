#!/usr/bin/env bash
set -euo pipefail

# Build script for sandbox-sync-agent images.
# Usage: ./build.sh [OPTIONS]
#
# Images:
#   base/Dockerfile          -> fastgpt-agent-sandbox:latest  (base image)
#   Dockerfile               -> fastgpt-agent-sandbox:k8s     (K8s sidecar)
#   Dockerfile.docker-runtime -> fastgpt-agent-sandbox:docker  (Docker dual-process)

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
REGISTRY=""
TAG="latest"
TARGET="all"
NO_CACHE=""
PLATFORM=""

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --registry)
      REGISTRY="${2:?'--registry requires a value'}"
      shift 2
      ;;
    --tag)
      TAG="${2:?'--tag requires a value'}"
      shift 2
      ;;
    --target)
      TARGET="${2:?'--target requires a value (base|k8s|docker|all)'}"
      shift 2
      ;;
    --no-cache)
      NO_CACHE="--no-cache"
      shift
      ;;
    --platform)
      PLATFORM="${2:?'--platform requires a value, e.g. linux/amd64'}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--registry <prefix>] [--tag <version>] [--target base|k8s|docker|all] [--no-cache] [--platform <platform>]"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Validate --target
case "$TARGET" in
  base|k8s|docker|all) ;;
  *)
    echo "Error: --target must be one of: base, k8s, docker, all" >&2
    exit 1
    ;;
esac

# ---------------------------------------------------------------------------
# Always run from the directory that contains this script
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ---------------------------------------------------------------------------
# Helper: build a docker image name
#   $1 = variant suffix (latest | k8s | docker)
# Returns the full image reference based on registry / tag settings.
# ---------------------------------------------------------------------------
image_name() {
  local suffix="$1"
  local name="fastgpt-agent-sandbox:${suffix}"

  # Override the tag portion when the user supplied --tag and suffix == "latest"
  # (base image is always tagged :latest locally; remote tag uses user-supplied tag)
  if [[ -n "$REGISTRY" ]]; then
    if [[ "$suffix" == "latest" ]]; then
      echo "${REGISTRY}/fastgpt-agent-sandbox:${TAG}"
    else
      echo "${REGISTRY}/fastgpt-agent-sandbox-${suffix}:${TAG}"
    fi
  else
    if [[ "$suffix" == "latest" && "$TAG" != "latest" ]]; then
      echo "fastgpt-agent-sandbox:${TAG}"
    else
      echo "$name"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Helper: build extra docker flags
# ---------------------------------------------------------------------------
extra_flags() {
  local flags="$NO_CACHE"
  if [[ -n "$PLATFORM" ]]; then
    flags="$flags --platform $PLATFORM"
  fi
  echo "$flags"
}

# ---------------------------------------------------------------------------
# Print a section header
# ---------------------------------------------------------------------------
section() {
  echo ""
  echo "========================================"
  echo "  $*"
  echo "========================================"
}

# ---------------------------------------------------------------------------
# Build base image
# ---------------------------------------------------------------------------
build_base() {
  section "Building BASE image"

  # The base/ subdirectory is the build context
  local local_tag="fastgpt-agent-sandbox:latest"
  # shellcheck disable=SC2046
  docker build \
    -t "$local_tag" \
    $(extra_flags) \
    base/

  echo "Built: $local_tag"

  # If a registry or non-default tag is requested, add the remote tag as well
  if [[ -n "$REGISTRY" ]] || [[ "$TAG" != "latest" ]]; then
    local remote_tag
    remote_tag="$(image_name latest)"
    if [[ "$remote_tag" != "$local_tag" ]]; then
      docker tag "$local_tag" "$remote_tag"
      echo "Tagged: $remote_tag"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Build K8s sidecar image
# ---------------------------------------------------------------------------
build_k8s() {
  section "Building K8S image"

  local tag
  if [[ -n "$REGISTRY" ]]; then
    tag="${REGISTRY}/fastgpt-agent-sandbox-k8s:${TAG}"
  else
    tag="fastgpt-agent-sandbox:k8s"
  fi

  # shellcheck disable=SC2046
  docker build \
    -f Dockerfile \
    -t "$tag" \
    $(extra_flags) \
    .

  echo "Built: $tag"
}

# ---------------------------------------------------------------------------
# Build Docker dual-process image
# ---------------------------------------------------------------------------
build_docker() {
  section "Building DOCKER-RUNTIME image"

  local tag
  if [[ -n "$REGISTRY" ]]; then
    tag="${REGISTRY}/fastgpt-agent-sandbox-docker:${TAG}"
  else
    tag="fastgpt-agent-sandbox:docker"
  fi

  # shellcheck disable=SC2046
  docker build \
    -f Dockerfile.docker-runtime \
    -t "$tag" \
    $(extra_flags) \
    .

  echo "Built: $tag"
}

# ---------------------------------------------------------------------------
# Print summary of built images
# ---------------------------------------------------------------------------
print_summary() {
  section "Build Summary"
  echo ""
  docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedAt}}" \
    | grep -E "REPOSITORY|fastgpt-agent-sandbox" || true
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
echo "Target  : $TARGET"
echo "Tag     : $TAG"
echo "Registry: ${REGISTRY:-'(none)'}"
echo "Platform: ${PLATFORM:-'(default)'}"
echo "No-cache: ${NO_CACHE:-'(no)'}"

# base must be built before k8s / docker when building all
if [[ "$TARGET" == "all" || "$TARGET" == "base" ]]; then
  build_base
fi

if [[ "$TARGET" == "all" || "$TARGET" == "k8s" ]]; then
  build_k8s
fi

if [[ "$TARGET" == "all" || "$TARGET" == "docker" ]]; then
  build_docker
fi

print_summary

echo ""
echo "Done."
