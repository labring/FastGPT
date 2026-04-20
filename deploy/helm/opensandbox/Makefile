# Helm Chart Makefile for OpenSandbox Controller

CHART_NAME := opensandbox-controller
RELEASE_NAME := opensandbox-controller
NAMESPACE := opensandbox
VALUES_FILE := values.yaml

# Helm commands
HELM := helm
KUBECTL := kubectl

.PHONY: help
help: ## Display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

.PHONY: lint
lint: ## Lint the Helm chart
	$(HELM) lint .

.PHONY: template
template: ## Render chart templates to stdout
	$(HELM) template $(RELEASE_NAME) . -f $(VALUES_FILE)

.PHONY: template-debug
template-debug: ## Render chart templates with debug output
	$(HELM) template $(RELEASE_NAME) . -f $(VALUES_FILE) --debug

.PHONY: dry-run
dry-run: ## Perform a dry-run installation
	$(HELM) install $(RELEASE_NAME) . \
		-f $(VALUES_FILE) \
		--namespace $(NAMESPACE) \
		--create-namespace \
		--dry-run --debug

.PHONY: install
install: ## Install the chart
	$(HELM) install $(RELEASE_NAME) . \
		-f $(VALUES_FILE) \
		--namespace $(NAMESPACE) \
		--create-namespace

.PHONY: install-e2e
install-e2e: ## Install the chart with e2e test values
	$(HELM) install $(RELEASE_NAME) . \
		-f values-e2e.yaml \
		--namespace $(NAMESPACE) \
		--create-namespace

.PHONY: upgrade
upgrade: ## Upgrade the chart
	$(HELM) upgrade $(RELEASE_NAME) . \
		-f $(VALUES_FILE) \
		--namespace $(NAMESPACE)

.PHONY: upgrade-e2e
upgrade-e2e: ## Upgrade with e2e test values
	$(HELM) upgrade $(RELEASE_NAME) . \
		-f values-e2e.yaml \
		--namespace $(NAMESPACE)

.PHONY: uninstall
uninstall: ## Uninstall the chart
	$(HELM) uninstall $(RELEASE_NAME) --namespace $(NAMESPACE)

.PHONY: status
status: ## Show release status
	$(HELM) status $(RELEASE_NAME) --namespace $(NAMESPACE)

.PHONY: list
list: ## List all releases
	$(HELM) list --namespace $(NAMESPACE)

.PHONY: get-values
get-values: ## Get values for the release
	$(HELM) get values $(RELEASE_NAME) --namespace $(NAMESPACE)

.PHONY: get-all
get-all: ## Get all information about the release
	$(HELM) get all $(RELEASE_NAME) --namespace $(NAMESPACE)

.PHONY: package
package: ## Package the chart into an archive
	$(HELM) package .

.PHONY: verify-install
verify-install: ## Verify the installation
	@echo "Checking deployment..."
	$(KUBECTL) get deployment -n $(NAMESPACE)
	@echo "\nChecking pods..."
	$(KUBECTL) get pods -n $(NAMESPACE)
	@echo "\nChecking CRDs..."
	$(KUBECTL) get crds | grep sandbox.opensandbox.io

.PHONY: logs
logs: ## Show controller logs
	$(KUBECTL) logs -n $(NAMESPACE) -l control-plane=controller-manager -f

.PHONY: clean-crds
clean-crds: ## Delete CRDs (use with caution!)
	$(KUBECTL) delete crd batchsandboxes.sandbox.opensandbox.io
	$(KUBECTL) delete crd pools.sandbox.opensandbox.io

.PHONY: test-connection
test-connection: ## Test if kubectl can connect to the cluster
	$(KUBECTL) cluster-info
	$(KUBECTL) get nodes

.PHONY: create-namespace
create-namespace: ## Create the namespace
	$(KUBECTL) create namespace $(NAMESPACE) --dry-run=client -o yaml | $(KUBECTL) apply -f -

.PHONY: delete-namespace
delete-namespace: ## Delete the namespace
	$(KUBECTL) delete namespace $(NAMESPACE)

# Advanced targets
.PHONY: diff
diff: ## Show diff between current release and chart
	@command -v helm-diff >/dev/null 2>&1 || { echo "helm-diff plugin required. Install: helm plugin install https://github.com/databus23/helm-diff"; exit 1; }
	$(HELM) diff upgrade $(RELEASE_NAME) . -f $(VALUES_FILE) --namespace $(NAMESPACE)

.PHONY: history
history: ## Show release history
	$(HELM) history $(RELEASE_NAME) --namespace $(NAMESPACE)

.PHONY: rollback
rollback: ## Rollback to previous release
	$(HELM) rollback $(RELEASE_NAME) --namespace $(NAMESPACE)

.PHONY: rollback-to
rollback-to: ## Rollback to specific revision (usage: make rollback-to REVISION=2)
	@if [ -z "$(REVISION)" ]; then echo "Please specify REVISION=<number>"; exit 1; fi
	$(HELM) rollback $(RELEASE_NAME) $(REVISION) --namespace $(NAMESPACE)
