#!/bin/bash
# OpenSandbox Controller Uninstall Script

set -e

# Check if sudo is required
USE_SUDO=false
if ! kubectl get nodes &> /dev/null 2>&1; then
    if sudo kubectl get nodes &> /dev/null 2>&1; then
        echo "Detected sudo privileges required, will use sudo to execute commands"
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

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}======================================${NC}"
echo -e "${YELLOW}OpenSandbox Controller Uninstall${NC}"
echo -e "${YELLOW}======================================${NC}"
echo ""

RELEASE_NAME="${RELEASE_NAME:-opensandbox-controller}"
NAMESPACE="${NAMESPACE:-opensandbox}"

# Check if already installed
if ! helm_cmd list -n "$NAMESPACE" | grep -q "$RELEASE_NAME"; then
    echo -e "${RED}Release not found: $RELEASE_NAME${NC}"
    echo "Currently installed releases:"
    helm_cmd list -A
    exit 1
fi

echo "About to uninstall:"
echo "  Release: $RELEASE_NAME"
echo "  Namespace: $NAMESPACE"
echo ""

# Show current resources
echo -e "${YELLOW}Current resources:${NC}"
echo "Controller:"
kubectl_cmd get deployment -n "$NAMESPACE" -l control-plane=controller-manager 2>/dev/null || echo "  Controller not found"
echo ""
echo "Server:"
kubectl_cmd get deployment -n "$NAMESPACE" -l app.kubernetes.io/component=server 2>/dev/null || echo "  Server not found"
echo ""

# Check if there are running resources
echo -e "${YELLOW}Checking custom resources...${NC}"
BATCHSANDBOXES=$(kubectl_cmd get batchsandboxes -A --no-headers 2>/dev/null | wc -l)
POOLS=$(kubectl_cmd get pools -A --no-headers 2>/dev/null | wc -l)

if [ "$BATCHSANDBOXES" -gt 0 ] || [ "$POOLS" -gt 0 ]; then
    echo -e "${RED}Warning: Running resources detected!${NC}"
    echo "  BatchSandboxes: $BATCHSANDBOXES"
    echo "  Pools: $POOLS"
    echo ""

    # Show Pool details
    if [ "$POOLS" -gt 0 ]; then
        echo "Pool details:"
        kubectl_cmd get pools -A
        echo ""
    fi

    echo "Recommended to delete these resources first:"
    echo "  $([ "$USE_SUDO" = true ] && echo "sudo ")kubectl delete batchsandboxes --all -A"
    echo "  $([ "$USE_SUDO" = true ] && echo "sudo ")kubectl delete pools --all -A"
    echo ""
    read -p "Continue with uninstall? [y/N]: " force_continue
    if [[ ! $force_continue =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Uninstall cancelled${NC}"
        exit 0
    fi
fi

# Confirm uninstall
read -p "Confirm uninstall of $RELEASE_NAME (including Controller and Server)? [y/N]: " confirm
if [[ ! $confirm =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Uninstall cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${GREEN}Starting uninstall...${NC}"

# Uninstall Helm release
helm_cmd uninstall "$RELEASE_NAME" -n "$NAMESPACE"

echo -e "${GREEN}✓ Helm release uninstalled${NC}"
echo ""

# Wait for Pod termination
echo "Waiting for Pods to terminate..."
sleep 5

# Ask whether to delete CRDs
read -p "Delete CRDs? (This will delete all BatchSandbox and Pool resources) [y/N]: " delete_crds
if [[ $delete_crds =~ ^[Yy]$ ]]; then
    echo "Deleting CRDs..."
    kubectl_cmd delete crd batchsandboxes.sandbox.opensandbox.io 2>/dev/null || echo "  CRD batchsandboxes does not exist"
    kubectl_cmd delete crd pools.sandbox.opensandbox.io 2>/dev/null || echo "  CRD pools does not exist"
    echo -e "${GREEN}✓ CRDs deleted${NC}"
else
    echo -e "${YELLOW}⊗ CRDs retained${NC}"
fi
echo ""

# Ask whether to delete namespace
read -p "Delete namespace $NAMESPACE? [y/N]: " delete_ns
if [[ $delete_ns =~ ^[Yy]$ ]]; then
    echo "Deleting namespace..."
    kubectl_cmd delete namespace "$NAMESPACE" 2>/dev/null || echo "  Namespace does not exist"
    echo -e "${GREEN}✓ Namespace deleted${NC}"
else
    echo -e "${YELLOW}⊗ Namespace retained${NC}"
fi

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}✓ Uninstall completed${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Verify uninstall
echo -e "${YELLOW}Verifying uninstall:${NC}"
echo "Checking Helm releases:"
helm_cmd list -n "$NAMESPACE" 2>/dev/null || echo "  Namespace does not exist"
echo ""
echo "Checking CRDs:"
kubectl_cmd get crds | grep sandbox.opensandbox.io || echo "  No OpenSandbox CRDs found"
echo ""
