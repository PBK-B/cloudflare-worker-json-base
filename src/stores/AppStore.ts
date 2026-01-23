import { makeAutoObservable, autorun } from 'mobx'

export interface DeploymentConfig {
  apiKey: string
  workerName: string
  kvNamespace: string
  domain?: string
}

export interface DeploymentStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in-progress' | 'completed' | 'error'
  error?: string
}

class AppStore {
  deploymentConfig: DeploymentConfig = {
    apiKey: '',
    workerName: 'worker-json-base',
    kvNamespace: 'JSONBIN',
  }

  deploymentSteps: DeploymentStep[] = [
    {
      id: 'config',
      title: '配置 API Key',
      description: '设置您的数据库访问密钥',
      status: 'pending',
    },
    {
      id: 'kv-bind',
      title: '绑定 KV 命名空间',
      description: '在 Cloudflare Dashboard 中创建并绑定 KV 命名空间',
      status: 'pending',
    },
    {
      id: 'deploy',
      title: '部署 Worker',
      description: '使用 wrangler CLI 部署到 Cloudflare Workers',
      status: 'pending',
    },
    {
      id: 'test',
      title: '测试功能',
      description: '验证 API 接口和 WebUI 控制台是否正常工作',
      status: 'pending',
    },
  ]

  currentStep = 0
  isDeployed = false
  isLoading = false

  constructor() {
    makeAutoObservable(this)
  }

  updateConfig(config: Partial<DeploymentConfig>) {
    this.deploymentConfig = { ...this.deploymentConfig, ...config }
  }

  updateStepStatus(stepId: string, status: DeploymentStep['status'], error?: string) {
    const step = this.deploymentSteps.find(s => s.id === stepId)
    if (step) {
      step.status = status
      if (error) step.error = error
    }
  }

  nextStep() {
    if (this.currentStep < this.deploymentSteps.length - 1) {
      this.currentStep++
    }
  }

  setDeployed(deployed: boolean) {
    this.isDeployed = deployed
  }

  setLoading(loading: boolean) {
    this.isLoading = loading
  }

  get currentStepData() {
    return this.deploymentSteps[this.currentStep]
  }

  get isDeploymentComplete() {
    return this.deploymentSteps.every(step => step.status === 'completed')
  }

  resetDeployment() {
    this.deploymentSteps.forEach(step => {
      step.status = 'pending'
      step.error = undefined
    })
    this.currentStep = 0
    this.isDeployed = false
  }
}

export default new AppStore()