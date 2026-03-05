#!/bin/bash
# OpenSandbox Controller Deployment Script

set -e

# Check if sudo is required
USE_SUDO=false
if ! kubectl get nodes &> /dev/null 2>&1; then
    if sudo kubectl get nodes &> /dev/null 2>&1; then
        echo "Detected that sudo permissions are required, will use sudo to execute commands"
        USE_SUDO=true
    else
        echo "Error: Unable to access Kubernetes cluster"
        exit 1
    fi
fi

# Define command functions
kubectl_cmd() {
    if [ "$USE_SUDO" = true ]; then
        sudo kubectl "$@"
    else
        kubectl "$@"
    fi
}

helm_cmd() {
    if [ "$USE_SUDO" = true ]; then
        sudo helm "$@"
    else
        helm "$@"
    fi
}

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}OpenSandbox Controller Helm Deployment${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Check dependencies
echo -e "${YELLOW}[1/6] Checking dependencies...${NC}"
if ! command -v helm &> /dev/null; then
    echo -e "${RED}Error: helm command not found${NC}"
    echo "Please install Helm 3.0+: https://helm.sh/docs/intro/install/"
    exit 1
fi

if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl command not found${NC}"
    echo "Please install kubectl: https://kubernetes.io/docs/tasks/tools/"
    exit 1
fi

echo -e "${GREEN}✓ Helm version: $(helm version --short)${NC}"
echo -e "${GREEN}✓ Kubectl version: $(kubectl version --client --short 2>/dev/null || kubectl version --client)${NC}"
echo ""

# Check cluster connection
echo -e "${YELLOW}[2/6] Checking Kubernetes cluster connection...${NC}"
if ! kubectl_cmd cluster-info &> /dev/null; then
    echo -e "${RED}Error: Unable to connect to Kubernetes cluster${NC}"
    echo "Please check your ~/.kube/config configuration"
    exit 1
fi
echo -e "${GREEN}✓ Cluster connection successful${NC}"
kubectl_cmd cluster-info | head -2
echo ""

# Configuration parameters
# Get the parent directory of the script directory (chart root directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$(dirname "$SCRIPT_DIR")"
RELEASE_NAME="opensandbox-controller"
NAMESPACE="opensandbox"

echo -e "${YELLOW}[3/6] Configuration parameters${NC}"
echo "Chart directory: $CHART_DIR"
echo "Release name: $RELEASE_NAME"
echo "Namespace: $NAMESPACE"
if [ -n "$IMAGE_REPO" ] || [ -n "$IMAGE_TAG" ]; then
    echo "Image override: ${IMAGE_REPO:-<from values>}:${IMAGE_TAG:-<from values>}"
else
    echo "Image configuration: Using configuration from values file"
fi
echo ""

# Select deployment environment
echo -e "${YELLOW}[4/6] Select deployment environment${NC}"
echo "1) Default configuration (values.yaml)"
echo "2) End-to-end testing (values-e2e.yaml)"
echo "3) Custom (custom values)"
read -p "Please select [1-3]: " env_choice

case $env_choice in
    1)
        VALUES_FILE="$CHART_DIR/values.yaml"
        echo -e "${GREEN}✓ Using default configuration${NC}"
        ;;
    2)
        VALUES_FILE="$CHART_DIR/values-e2e.yaml"
        echo -e "${GREEN}✓ E2E test configuration selected${NC}"
        ;;
    3)
        read -p "Please enter values file path: " custom_values
        VALUES_FILE="$custom_values"
        echo -e "${GREEN}✓ Using custom configuration: $VALUES_FILE${NC}"
        ;;
    *)
        echo -e "${RED}Invalid selection, using default configuration${NC}"
        VALUES_FILE="$CHART_DIR/values.yaml"
        ;;
esac
echo ""

# Validate Chart
echo -e "${YELLOW}[5/6] Validating Helm Chart...${NC}"
if ! helm lint "$CHART_DIR" &> /dev/null; then
    echo -e "${RED}Error: Chart validation failed${NC}"
    helm lint "$CHART_DIR"
    exit 1
fi
echo -e "${GREEN}✓ Chart validation passed${NC}"
echo ""

# Confirm deployment
echo -e "${YELLOW}[6/6] Preparing for deployment${NC}"
echo "The following operations will be performed:"
echo "  - Create namespace: $NAMESPACE"
echo "  - Install CRDs: BatchSandbox, Pool"
echo "  - Deploy Controller Manager"
echo "  - Deploy Server (FastAPI control plane)"
echo "  - Deploy RBAC resources"
echo "  - Deploy Metrics service"
echo "  - Create default Pool (agent-pool)"
echo ""
read -p "Confirm deployment? [y/N]: " confirm

if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Deployment cancelled${NC}"
    exit 0
fi

# Execute deployment
echo ""
echo -e "${GREEN}Starting deployment...${NC}"
echo ""

# If environment variables are set, override image configuration in values file
EXTRA_ARGS=""
if [ -n "$IMAGE_REPO" ]; then
    EXTRA_ARGS="$EXTRA_ARGS --set controllerManager.image.repository=$IMAGE_REPO"
fi
if [ -n "$IMAGE_TAG" ]; then
    EXTRA_ARGS="$EXTRA_ARGS --set controllerManager.image.tag=$IMAGE_TAG"
fi
if [ -n "$SERVER_IMAGE_REPO" ]; then
    EXTRA_ARGS="$EXTRA_ARGS --set server.image.repository=$SERVER_IMAGE_REPO"
fi
if [ -n "$SERVER_IMAGE_TAG" ]; then
    EXTRA_ARGS="$EXTRA_ARGS --set server.image.tag=$SERVER_IMAGE_TAG"
fi

helm_cmd upgrade --install "$RELEASE_NAME" "$CHART_DIR" \
    --namespace "$NAMESPACE" \
    --create-namespace \
    -f "$VALUES_FILE" \
    $EXTRA_ARGS \
    --wait \
    --timeout 5m

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}✓ Deployment completed!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Display deployment information
echo -e "${YELLOW}Deployment information:${NC}"
helm_cmd status "$RELEASE_NAME" -n "$NAMESPACE"

echo ""
echo -e "${YELLOW}Verify deployment:${NC}"
echo "1. Check Pod status:"
echo "   $([ "$USE_SUDO" = true ] && echo "sudo ")kubectl get pods -n $NAMESPACE"
echo ""
echo "2. View Controller logs:"
echo "   $([ "$USE_SUDO" = true ] && echo "sudo ")kubectl logs -n $NAMESPACE -l control-plane=controller-manager -f"
echo ""
echo "3. View Server logs:"
echo "   $([ "$USE_SUDO" = true ] && echo "sudo ")kubectl logs -n $NAMESPACE -l app.kubernetes.io/component=server -f"
echo ""
echo "4. Access Server API (Port Forward):"
echo "   $([ "$USE_SUDO" = true ] && echo "sudo ")kubectl port-forward -n $NAMESPACE svc/$RELEASE_NAME-server 8080:8080"
echo "   curl http://localhost:8080/health"
echo ""
echo "5. View CRDs:"
echo "   $([ "$USE_SUDO" = true ] && echo "sudo ")kubectl get crds | grep sandbox.opensandbox.io"
echo ""
echo "6. Check Pool status:"
echo "   $([ "$USE_SUDO" = true ] && echo "sudo ")kubectl get pools -n $NAMESPACE"
echo ""

echo -e "${GREEN}Thank you for using OpenSandbox Controller!${NC}"
