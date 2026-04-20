#!/bin/bash
# OpenSandbox Helm Chart End-to-End Test Script
set -x
set -e

# Get the parent directory of the script's directory (chart root directory)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$(dirname "$SCRIPT_DIR")"
NAMESPACE="opensandbox"
RELEASE_NAME="opensandbox-e2e-test"
VALUES_FILE="${1:-values-e2e.yaml}"

# Cleanup function: ensure temporary resources are cleaned up
cleanup() {
    # Clean up any test resources that might be left over
    if command -v kubectl &> /dev/null || command -v minikube &> /dev/null; then
        kubectl delete configmap sdk-test-script -n "$NAMESPACE" --ignore-not-found=true > /dev/null 2>&1 || true
        kubectl delete job sdk-test-job -n "$NAMESPACE" --ignore-not-found=true > /dev/null 2>&1 || true
        kubectl delete pod server-health-check -n "$NAMESPACE" --ignore-not-found=true > /dev/null 2>&1 || true
    fi
}

# Register cleanup function to ensure execution on script exit
trap cleanup EXIT INT TERM

# Check kubectl availability and detect minikube
USE_SUDO=false
USE_MINIKUBE=false

# First check if kubectl is available directly
if kubectl get nodes &> /dev/null 2>&1; then
    echo "Detected kubectl access to Kubernetes cluster"
elif sudo kubectl get nodes &> /dev/null 2>&1; then
    echo "Detected sudo privileges required, will use sudo for commands"
    USE_SUDO=true
# If kubectl is not available, check for minikube
elif command -v minikube &> /dev/null && minikube kubectl -- get nodes &> /dev/null 2>&1; then
    echo "Detected minikube cluster, will use 'minikube kubectl --' for commands"
    USE_MINIKUBE=true
elif command -v minikube &> /dev/null && sudo minikube kubectl -- get nodes &> /dev/null 2>&1; then
    echo "Detected minikube cluster with sudo, will use 'sudo minikube kubectl --' for commands"
    USE_MINIKUBE=true
    USE_SUDO=true
else
    echo "Error: Unable to access Kubernetes cluster"
    echo "Please ensure kubectl or minikube is properly configured"
    exit 1
fi

# Define command functions
kubectl_cmd() {
    if [ "$USE_MINIKUBE" = true ]; then
        if [ "$USE_SUDO" = true ]; then
            sudo minikube kubectl -- "$@"
        else
            minikube kubectl -- "$@"
        fi
    else
        if [ "$USE_SUDO" = true ]; then
            sudo kubectl "$@"
        else
            kubectl "$@"
        fi
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

echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}OpenSandbox Helm Chart E2E Validation${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo "Test Coverage:"
echo "  1. Helm Install (using ${VALUES_FILE})"
echo "  2. Server Deployment Verification"
echo "  3. Pool Deployment Verification"
echo "  4. SDK Integration Verification"
echo "  5. Helm Uninstall"
echo ""
echo "Environment Info:"
echo "  Chart: ${CHART_DIR}"
echo "  Values: ${VALUES_FILE}"
echo "  Release: ${RELEASE_NAME}"
echo "  Namespace: ${NAMESPACE}"
echo ""

# ==========================================
# Stage 1: Helm Install
# ==========================================
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Stage 1: Helm Install${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""

echo -e "${YELLOW}[1.1] Checking for existing release...${NC}"
if helm_cmd list -n "$NAMESPACE" 2>/dev/null | grep -q "$RELEASE_NAME"; then
    echo "  Release already exists, uninstalling first..."
    helm_cmd uninstall "$RELEASE_NAME" -n "$NAMESPACE" 2>/dev/null || true
    sleep 5
fi
echo -e "${GREEN}✓ Check completed${NC}"
echo ""

echo -e "${YELLOW}[1.2] Installing Helm chart (using ${VALUES_FILE})...${NC}"
helm_cmd install "$RELEASE_NAME" "$CHART_DIR" \
    --values "$CHART_DIR/$VALUES_FILE" \
    --namespace "$NAMESPACE" \
    --create-namespace \
    --wait \
    --timeout 3m 2>&1 | tail -5
echo -e "${GREEN}✓ Helm chart installed successfully${NC}"
echo ""

echo -e "${YELLOW}[1.3] Waiting for Controller to be ready...${NC}"
kubectl_cmd wait --for=condition=available \
    deployment/opensandbox-controller-manager \
    -n "$NAMESPACE" \
    --timeout=120s 2>/dev/null
echo -e "${GREEN}✓ Controller is ready${NC}"
echo ""

echo -e "${YELLOW}[1.4] Checking deployment status...${NC}"
kubectl_cmd get deployment -n "$NAMESPACE"
echo ""

echo -e "${GREEN}✅ Stage 1 Complete: Helm Install Successful${NC}"
echo ""

# ==========================================
# Stage 2: Server Deployment Verification
# ==========================================
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Stage 2: Server Deployment Verification${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""

echo -e "${YELLOW}[2.1] Checking Server Service...${NC}"
SERVER_SERVICE_NAME=$(kubectl_cmd get svc -n "$NAMESPACE" -l app.kubernetes.io/component=server -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -z "$SERVER_SERVICE_NAME" ]; then
    echo -e "${RED}❌ Server Service does not exist${NC}"
    exit 1
fi
echo "  Server Service: ${SERVER_SERVICE_NAME}"
kubectl_cmd get svc "$SERVER_SERVICE_NAME" -n "$NAMESPACE"
echo ""

echo -e "${YELLOW}[2.2] Waiting for Server Pod to be ready...${NC}"
SERVER_DEPLOYMENT_NAME=$(kubectl_cmd get deployment -n "$NAMESPACE" -l app.kubernetes.io/component=server -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -z "$SERVER_DEPLOYMENT_NAME" ]; then
    echo -e "${RED}❌ Server Deployment does not exist${NC}"
    exit 1
fi
echo "  Server Deployment: ${SERVER_DEPLOYMENT_NAME}"
kubectl_cmd wait --for=condition=available \
    deployment/"$SERVER_DEPLOYMENT_NAME" \
    -n "$NAMESPACE" \
    --timeout=120s 2>/dev/null
echo -e "${GREEN}✓ Server Deployment is ready${NC}"
echo ""

echo -e "${YELLOW}[2.3] Checking Server Pod status...${NC}"
kubectl_cmd get pods -n "$NAMESPACE" -l app.kubernetes.io/component=server
echo ""

echo -e "${YELLOW}[2.4] Testing Server API (from within cluster)...${NC}"
# Create a simple test pod to check server health from inside the cluster
cat <<EOF | kubectl_cmd apply -f - > /dev/null
apiVersion: v1
kind: Pod
metadata:
  name: server-health-check
  namespace: $NAMESPACE
spec:
  restartPolicy: Never
  containers:
  - name: curl
    image: curlimages/curl:latest
    command: ['curl', '-s', 'http://${SERVER_SERVICE_NAME}:8080/health']
EOF

# Wait for pod to complete
kubectl_cmd wait --for=condition=Ready pod/server-health-check -n "$NAMESPACE" --timeout=30s 2>/dev/null || true
sleep 2
HEALTH_RESPONSE=$(kubectl_cmd logs server-health-check -n "$NAMESPACE" 2>/dev/null || echo "")
kubectl_cmd delete pod server-health-check -n "$NAMESPACE" --ignore-not-found=true > /dev/null 2>&1

if [ -n "$HEALTH_RESPONSE" ]; then
    echo -e "${GREEN}✓ Server API responding normally: $HEALTH_RESPONSE${NC}"
else
    echo -e "${RED}❌ Server API not responding${NC}"
    exit 1
fi
echo ""

echo -e "${GREEN}✅ Stage 2 Complete: Server Deployment Verified${NC}"
echo ""

# ==========================================
# Stage 3: Pool Deployment Verification
# ==========================================
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Stage 3: Pool Deployment Verification${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""

echo -e "${YELLOW}[3.1] Checking Pool resources...${NC}"
POOL_COUNT=$(kubectl_cmd get pool -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
echo "  Pool count: ${POOL_COUNT}"
if [ "$POOL_COUNT" -eq 0 ]; then
    echo -e "${RED}❌ No Pool resources found${NC}"
    exit 1
fi
kubectl_cmd get pool -n "$NAMESPACE"
echo ""

echo -e "${YELLOW}[3.2] Checking agent-pool status...${NC}"
if ! kubectl_cmd get pool agent-pool -n "$NAMESPACE" --no-headers 2>/dev/null | grep -q agent-pool; then
    echo -e "${RED}❌ agent-pool does not exist${NC}"
    exit 1
fi
echo -e "${GREEN}✓ agent-pool exists${NC}"
echo ""

echo -e "${YELLOW}[3.3] Viewing Pool detailed status...${NC}"
kubectl_cmd get pool agent-pool -n "$NAMESPACE" -o jsonpath='{.status}' 2>/dev/null | jq '.' 2>/dev/null || echo "  (jq not installed, skipping JSON formatting)"
echo ""

echo -e "${YELLOW}[3.4] Waiting for Pool Pods to be ready (up to 180 seconds)...${NC}"
TIMEOUT=180
ELAPSED=0
READY=false
while [ $ELAPSED -lt $TIMEOUT ]; do
    AVAILABLE=$(kubectl_cmd get pool agent-pool -n "$NAMESPACE" -o jsonpath='{.status.available}' 2>/dev/null || echo "")
    if [ -n "$AVAILABLE" ] && [ "$AVAILABLE" -gt 0 ]; then
        echo -e "${GREEN}✓ Pool has ${AVAILABLE} available Pods${NC}"
        READY=true
        break
    fi
    echo "  Waiting... (${ELAPSED}s/${TIMEOUT}s)"
    sleep 5
    ELAPSED=$((ELAPSED + 5))
done
if [ "$READY" = false ]; then
    echo -e "${RED}❌ Pool Pods not ready, timed out${NC}"
    echo ""
    echo "Viewing Pool events:"
    kubectl_cmd describe pool agent-pool -n "$NAMESPACE" | tail -20
    exit 1
fi
echo ""

echo -e "${YELLOW}[3.5] Viewing Pool Pods...${NC}"
kubectl_cmd get pods -l pool=agent-pool -n "$NAMESPACE"
echo ""

echo -e "${YELLOW}[3.6] Checking execd process in Pod...${NC}"
POD_NAME=$(kubectl_cmd get pods -l pool=agent-pool -n "$NAMESPACE" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -n "$POD_NAME" ]; then
    echo "  Checking Pod: ${POD_NAME}"
    sleep 3
    if kubectl_cmd exec -n "$NAMESPACE" "$POD_NAME" -c sandbox-container -- pgrep -f execd > /dev/null 2>&1; then
        EXECD_PID=$(kubectl_cmd exec -n "$NAMESPACE" "$POD_NAME" -c sandbox-container -- pgrep -f execd 2>/dev/null)
        echo -e "${GREEN}✓ execd process is running (PID: ${EXECD_PID})${NC}"
    else
        echo -e "${YELLOW}⚠️  execd process not found, checking container logs...${NC}"
        kubectl_cmd logs -n "$NAMESPACE" "$POD_NAME" -c sandbox-container --tail=20 2>/dev/null || true
    fi
else
    echo -e "${YELLOW}⚠️  No agent-pool Pod found${NC}"
fi
echo ""

echo -e "${GREEN}✅ Stage 3 Complete: Pool Deployment Verified${NC}"
echo ""

# ==========================================
# Stage 4: SDK Integration Verification
# ==========================================
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Stage 4: SDK Integration Verification${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""

echo -e "${YELLOW}[4.1] Creating SDK test script ConfigMap...${NC}"
SDK_TEST_SCRIPT=$(cat <<'EOF'
import asyncio
from datetime import timedelta
from opensandbox import Sandbox
from opensandbox.config import ConnectionConfig

async def main():
    print("=" * 60)
    print("SDK End-to-End Test")
    print("=" * 60)

    # Use internal service name for cluster-internal communication
    config = ConnectionConfig(domain="SERVER_SERVICE_PLACEHOLDER:8080")

    print("\n[Test 1] Creating sandbox (using agent-pool)...")
    try:
        sandbox = await Sandbox.create(
            "nginx:latest",
            entrypoint=["/bin/sh", "-c", "sleep infinity"],
            env={"TEST": "e2e"},
            timeout=timedelta(minutes=10),
            ready_timeout=timedelta(minutes=5),
            connection_config=config,
            extensions={"poolRef": "agent-pool"}
        )
        print(f"✅ Sandbox created successfully: {sandbox.id}")
    except Exception as e:
        print(f"❌ Sandbox creation failed: {e}")
        import traceback
        traceback.print_exc()
        return False

    try:
        print("\n[Test 2] Executing command...")
        execution = await sandbox.commands.run("echo 'Hello from E2E test'")
        if execution.logs.stdout:
            print(f"✅ Command executed successfully: {execution.logs.stdout[0].text}")
        else:
            print("⚠️  Command executed successfully but no output")

        print("\n[Test 3] File operations...")
        from opensandbox.models import WriteEntry
        await sandbox.files.write_files([
            WriteEntry(path="/tmp/e2e.txt", data="E2E Test", mode=644)
        ])
        print("✅ File written successfully")

        content = await sandbox.files.read_file("/tmp/e2e.txt")
        print(f"✅ File read successfully: {content}")

        print("\n[Test 4] Cleaning up sandbox...")
        await sandbox.kill()
        print("✅ Sandbox cleaned up successfully")

        print("\n" + "=" * 60)
        print("✅ All SDK end-to-end tests passed!")
        print("=" * 60)
        return True

    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        try:
            await sandbox.kill()
        except:
            pass
        return False

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)
EOF
)

# Replace placeholder with actual service name
SDK_TEST_SCRIPT="${SDK_TEST_SCRIPT//SERVER_SERVICE_PLACEHOLDER/${SERVER_SERVICE_NAME}}"

# Create ConfigMap with test script
cat <<EOF | kubectl_cmd apply -f - > /dev/null
apiVersion: v1
kind: ConfigMap
metadata:
  name: sdk-test-script
  namespace: $NAMESPACE
data:
  test.py: |
$(echo "$SDK_TEST_SCRIPT" | sed 's/^/    /')
EOF

echo -e "${GREEN}✓ SDK test script ConfigMap created${NC}"
echo ""

echo -e "${YELLOW}[4.2] Creating SDK test Job...${NC}"
cat <<EOF | kubectl_cmd apply -f - > /dev/null
apiVersion: batch/v1
kind: Job
metadata:
  name: sdk-test-job
  namespace: $NAMESPACE
spec:
  ttlSecondsAfterFinished: 300
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: sdk-test
        image: ghcr.io/astral-sh/uv:python3.12-bookworm
        command:
        - /bin/bash
        - -c
        - |
          set -e
          echo "Installing opensandbox SDK..."
          uv pip install --system opensandbox
          echo ""
          echo "Running SDK tests..."
          python /test/test.py
        volumeMounts:
        - name: test-script
          mountPath: /test
      volumes:
      - name: test-script
        configMap:
          name: sdk-test-script
EOF

echo -e "${GREEN}✓ SDK test Job created${NC}"
echo ""

echo -e "${YELLOW}[4.3] Waiting for SDK test Job to complete (timeout: 5 minutes)...${NC}"
# Wait for job to start
sleep 5

# Get pod name
SDK_TEST_POD=""
for i in $(seq 1 30); do
    SDK_TEST_POD=$(kubectl_cmd get pods -n "$NAMESPACE" -l job-name=sdk-test-job -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    if [ -n "$SDK_TEST_POD" ]; then
        echo "  SDK test pod: $SDK_TEST_POD"
        break
    fi
    sleep 2
done

if [ -z "$SDK_TEST_POD" ]; then
    echo -e "${RED}❌ SDK test pod not found${NC}"
    kubectl_cmd get jobs -n "$NAMESPACE" sdk-test-job
    exit 1
fi

# Stream logs and wait for completion
echo ""
echo "  Streaming test logs:"
echo "  ---"
kubectl_cmd logs -f "$SDK_TEST_POD" -n "$NAMESPACE" 2>/dev/null || true
echo "  ---"
echo ""

# Wait a bit for Job to update status after pod completion
echo "  Waiting for Job status to update..."
sleep 5

# Wait for job to complete (up to 60 seconds)
for i in $(seq 1 60); do
    JOB_STATUS=$(kubectl_cmd get job sdk-test-job -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}' 2>/dev/null || echo "")
    JOB_FAILED=$(kubectl_cmd get job sdk-test-job -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}' 2>/dev/null || echo "")

    if [ "$JOB_STATUS" = "True" ] || [ "$JOB_FAILED" = "True" ]; then
        break
    fi
    sleep 1
done

# Check job status
JOB_STATUS=$(kubectl_cmd get job sdk-test-job -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Complete")].status}' 2>/dev/null || echo "")
JOB_FAILED=$(kubectl_cmd get job sdk-test-job -n "$NAMESPACE" -o jsonpath='{.status.conditions[?(@.type=="Failed")].status}' 2>/dev/null || echo "")

if [ "$JOB_STATUS" = "True" ]; then
    echo -e "${GREEN}✅ Stage 4 Complete: SDK Integration Verified${NC}"
elif [ "$JOB_FAILED" = "True" ]; then
    echo -e "${RED}❌ Stage 4 Failed: SDK Integration Failed${NC}"
    echo ""
    echo -e "${YELLOW}Diagnostic Information:${NC}"
    kubectl_cmd describe job sdk-test-job -n "$NAMESPACE" | tail -20
    exit 1
else
    echo -e "${RED}❌ Stage 4 Failed: SDK test job did not complete${NC}"
    kubectl_cmd get job sdk-test-job -n "$NAMESPACE"
    exit 1
fi
echo ""

# ==========================================
# Stage 5: Helm Uninstall
# ==========================================
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}Stage 5: Helm Uninstall${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""

echo -e "${YELLOW}[5.1] Cleaning up test resources...${NC}"
kubectl_cmd delete configmap sdk-test-script -n "$NAMESPACE" --ignore-not-found=true > /dev/null 2>&1
kubectl_cmd delete job sdk-test-job -n "$NAMESPACE" --ignore-not-found=true > /dev/null 2>&1
echo -e "${GREEN}✓ Test resources cleaned up${NC}"
echo ""

echo -e "${YELLOW}[5.2] Uninstalling Helm release...${NC}"
helm_cmd uninstall "$RELEASE_NAME" -n "$NAMESPACE"
echo -e "${GREEN}✓ Helm release uninstalled${NC}"
echo ""

echo "Waiting for resource cleanup..."
sleep 10

echo -e "${YELLOW}[5.3] Verifying resources are cleaned up...${NC}"
REMAINING_PODS=$(kubectl_cmd get pods -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
REMAINING_POOLS=$(kubectl_cmd get pools -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l)
echo "  Remaining Pods: ${REMAINING_PODS}"
echo "  Remaining Pools: ${REMAINING_POOLS}"

if [ "$REMAINING_PODS" -eq 0 ] && [ "$REMAINING_POOLS" -eq 0 ]; then
    echo -e "${GREEN}✓ All resources cleaned up${NC}"
else
    echo -e "${YELLOW}⚠️  Resources still remaining (Terminating)${NC}"
    if [ "$REMAINING_PODS" -gt 0 ]; then
        kubectl_cmd get pods -n "$NAMESPACE" 2>/dev/null || true
    fi
fi
echo ""

echo -e "${GREEN}✅ Stage 5 Complete: Helm Uninstall Successful${NC}"
echo ""

# ==========================================
# Test Summary
# ==========================================
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN}End-to-End Test Complete!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo "Test Results:"
echo -e "  ${GREEN}✅ Stage 1: Helm Install - Success${NC}"
echo -e "  ${GREEN}✅ Stage 2: Server Deployment Verification - Success${NC}"
echo -e "  ${GREEN}✅ Stage 3: Pool Deployment Verification - Success${NC}"
echo -e "  ${GREEN}✅ Stage 4: SDK Integration Verification - Success${NC}"
echo -e "  ${GREEN}✅ Stage 5: Helm Uninstall - Success${NC}"
echo ""
echo -e "${GREEN}🎉 All tests passed!${NC}"
echo ""
