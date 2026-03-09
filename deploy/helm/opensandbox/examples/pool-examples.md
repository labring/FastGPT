# Pool示例 - 包含Task Executor Sidecar

## 基本Pool（不包含任务执行）

```yaml
apiVersion: sandbox.opensandbox.io/v1alpha1
kind: Pool
metadata:
  name: basic-pool
  namespace: default
spec:
  template:
    spec:
      containers:
      - name: sandbox-container
        image: ubuntu:22.04
        command: ["sleep", "infinity"]
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"
  capacitySpec:
    bufferMax: 10
    bufferMin: 2
    poolMax: 20
    poolMin: 5
```

## Pool with Task Executor（支持任务执行）

**重要提示**：
- Task Executor作为sidecar容器运行在Pool的Pod中
- 必须启用`shareProcessNamespace: true`以共享进程命名空间
- Task Executor需要`SYS_PTRACE`权限来注入进程

```yaml
apiVersion: sandbox.opensandbox.io/v1alpha1
kind: Pool
metadata:
  name: task-enabled-pool
  namespace: default
spec:
  template:
    spec:
      # 必需：共享进程命名空间，允许task-executor访问sandbox容器的进程
      shareProcessNamespace: true
      containers:
      # 主容器：沙箱环境
      - name: sandbox-container
        image: ubuntu:22.04
        command: ["sleep", "infinity"]
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"

      # Sidecar：Task Executor（用于任务注入）
      - name: task-executor
        # 使用Helm values中配置的镜像
        # {{ .Values.taskExecutor.image.repository }}:{{ .Values.taskExecutor.image.tag }}
        image: opensandbox.io/task-executor:v0.0.1
        imagePullPolicy: IfNotPresent
        resources:
          requests:
            cpu: "100m"
            memory: "128Mi"
          limits:
            cpu: "500m"
            memory: "256Mi"
        securityContext:
          # 必需：需要ptrace权限来注入进程到sandbox容器
          capabilities:
            add: ["SYS_PTRACE"]

  capacitySpec:
    bufferMax: 10
    bufferMin: 2
    poolMax: 20
    poolMin: 5
```

## BatchSandbox with Tasks（使用Pool执行任务）

创建使用上述Pool的BatchSandbox，并执行异构任务：

```yaml
apiVersion: sandbox.opensandbox.io/v1alpha1
kind: BatchSandbox
metadata:
  name: task-batch-sandbox
  namespace: default
spec:
  # 副本数量
  replicas: 3

  # 引用包含task-executor的Pool
  poolRef: task-enabled-pool

  # TTL：3600秒后自动清理
  ttlSecondsAfterFinished: 3600

  # 默认任务模板（所有沙箱共享）
  taskTemplate:
    spec:
      process:
        command: ["echo", "Default task"]

  # 异构任务：为每个沙箱自定义不同的任务
  shardTaskPatches:
  - spec:
      process:
        command: ["python3", "-c", "print('Task for sandbox 0')"]
  - spec:
      process:
        command: ["bash", "-c", "echo 'Task for sandbox 1' && sleep 5"]
  - spec:
      process:
        command: ["node", "-e", "console.log('Task for sandbox 2')"]
```

## 镜像配置说明

### 方式1：使用Helm Values配置

在`values.yaml`中配置task-executor镜像：

```yaml
taskExecutor:
  image:
    repository: your-registry/opensandbox-task-executor
    tag: "v1.0.0"
    pullPolicy: IfNotPresent
```

然后在Pool YAML中引用：

```yaml
image: your-registry/opensandbox-task-executor:v1.0.0
```

### 方式2：使用环境变量（ConfigMap）

创建ConfigMap存储镜像信息：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: opensandbox-images
  namespace: default
data:
  taskExecutorImage: "your-registry/opensandbox-task-executor:v1.0.0"
```

在应用层读取ConfigMap并创建Pool。

### 方式3：使用Kustomize替换

使用Kustomize的镜像替换功能：

```yaml
# kustomization.yaml
images:
- name: opensandbox.io/task-executor
  newName: your-registry/opensandbox-task-executor
  newTag: v1.0.0
```

## 验证Task Executor

创建资源后，验证task-executor是否正常运行：

```bash
# 查看Pool状态
kubectl get pools task-enabled-pool

# 查看Pool创建的Pod
kubectl get pods -l pool=task-enabled-pool

# 检查Pod中是否有task-executor容器
kubectl get pods -l pool=task-enabled-pool -o jsonpath='{.items[0].spec.containers[*].name}'
# 输出应包含: sandbox-container task-executor

# 查看task-executor日志
kubectl logs <pod-name> -c task-executor

# 查看BatchSandbox任务状态
kubectl get batchsandbox task-batch-sandbox -o wide
# 应显示: TASK_RUNNING, TASK_SUCCEED, TASK_FAILED 等状态
```

## 故障排查

### Task Executor无法启动

```bash
# 检查容器状态
kubectl describe pod <pod-name>

# 检查权限问题
kubectl get pod <pod-name> -o jsonpath='{.spec.containers[1].securityContext}'
# 应显示: {"capabilities":{"add":["SYS_PTRACE"]}}

# 检查进程命名空间共享
kubectl get pod <pod-name> -o jsonpath='{.spec.shareProcessNamespace}'
# 应显示: true
```

### 任务执行失败

```bash
# 查看任务状态
kubectl describe batchsandbox task-batch-sandbox

# 查看task-executor日志
kubectl logs <pod-name> -c task-executor -f

# 查看sandbox容器日志
kubectl logs <pod-name> -c sandbox-container
```

## 性能考虑

- **资源配置**：根据任务复杂度调整task-executor的资源限制
- **并发控制**：Pool的`bufferMax`和`poolMax`控制并发沙箱数量
- **任务超时**：在taskTemplate中配置超时时间防止任务卡死
- **清理策略**：使用`ttlSecondsAfterFinished`自动清理完成的沙箱

## 最佳实践

1. **镜像版本管理**：controller和task-executor镜像版本保持一致
2. **资源限制**：task-executor通常需要更多CPU用于进程注入
3. **安全配置**：只在需要时启用`SYS_PTRACE`权限
4. **任务设计**：将长时间运行的任务拆分为多个短任务
5. **监控告警**：监控任务失败率和执行时间
