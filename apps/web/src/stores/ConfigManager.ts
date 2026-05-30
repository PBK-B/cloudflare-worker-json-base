import { makeAutoObservable } from 'mobx'

export interface WorkerConfig {
  apiKey: string
  workerName: string
  kvNamespace: string
  domain?: string
  environment: 'development' | 'production'
}

export interface DeploymentStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'error'
  error?: string
  commands?: string[]
  validation?: () => Promise<boolean>
}

export interface CloudflareConfig {
  accountId?: string
  apiToken?: string
  email?: string
  globalApiKey?: string
}

export class ConfigManager {
  workerConfig: WorkerConfig = {
    apiKey: '',
    workerName: 'worker-json-base',
    kvNamespace: 'JSONBIN',
    environment: 'development',
  }

  cloudflareConfig: CloudflareConfig = {}

  deploymentSteps: DeploymentStep[] = [
    {
      id: 'auth',
      title: 'Cloudflare 认证',
      description: '确认 Cloudflare Wrangler 已完成登录。',
      status: 'pending',
      commands: ['wrangler login'],
    },
    {
      id: 'config',
      title: '配置 Worker',
      description: '填写 Worker 名称、API Key 以及存储绑定。',
      status: 'pending',
    },
    {
      id: 'kvCreate',
      title: '创建 KV',
      description: '如果尚未创建 KV 命名空间，请先创建。',
      status: 'pending',
      commands: ['wrangler kv:namespace create "JSONBIN"'],
    },
    {
      id: 'deploy',
      title: '部署',
      description: '执行构建并部署到 Cloudflare Workers。',
      status: 'pending',
      commands: ['npm run build', 'npm run deploy'],
    },
  ]

  currentStep = 0
  isLoading = false
  isDeployed = false

  constructor() {
    makeAutoObservable(this)
  }

  updateWorkerConfig(config: Partial<WorkerConfig>) {
    this.workerConfig = { ...this.workerConfig, ...config }
  }

  updateCloudflareConfig(config: Partial<CloudflareConfig>) {
    this.cloudflareConfig = { ...this.cloudflareConfig, ...config }
  }

  updateStepStatus(stepId: string, status: DeploymentStep['status'], error?: string) {
    const step = this.deploymentSteps.find(s => s.id === stepId)
    if (step) {
      step.status = status
      step.error = error
    }
  }

  nextStep() {
    if (this.currentStep < this.deploymentSteps.length - 1) {
      this.currentStep++
    }
  }

  setCurrentStep(stepIndex: number) {
    if (stepIndex >= 0 && stepIndex < this.deploymentSteps.length) {
      this.currentStep = stepIndex
    }
  }

  setLoading(loading: boolean) {
    this.isLoading = loading
  }

  setDeployed(deployed: boolean) {
    this.isDeployed = deployed
  }

  reset() {
    this.workerConfig = {
      apiKey: '',
      workerName: 'worker-json-base',
      kvNamespace: 'JSONBIN',
      environment: 'development',
    }
    this.cloudflareConfig = {}
    this.deploymentSteps.forEach(step => {
      step.status = 'pending'
      step.error = undefined
    })
    this.currentStep = 0
    this.isLoading = false
    this.isDeployed = false
  }
}

export const configManager = new ConfigManager()
