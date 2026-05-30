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
      title: '配置 Worker',
      description: '填写 API Key 和 Cloudflare Worker 配置信息',
      status: 'pending',
    },
    {
      id: 'deploy',
      title: '自动部署',
      description: '使用 wrangler CLI 部署到 Cloudflare Workers',
      status: 'pending',
    },
    {
      id: 'verify',
      title: '验证部署',
      description: '验证 WebUI 控制台和存储 API 是否正常工作',
      status: 'pending',
    },
  ]

  currentStep = 0
  isLoading = false
  isDeployed = false

  constructor() {
    makeAutoObservable(this)
    autorun(() => {
      localStorage.setItem('jsonbase-app-store', JSON.stringify({
        deploymentConfig: this.deploymentConfig,
        currentStep: this.currentStep,
        isDeployed: this.isDeployed,
      }))
    })
    this.loadFromStorage()
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem('jsonbase-app-store')
      if (stored) {
        const parsed = JSON.parse(stored)
        this.deploymentConfig = { ...this.deploymentConfig, ...parsed.deploymentConfig }
        this.currentStep = parsed.currentStep || 0
        this.isDeployed = parsed.isDeployed || false
      }
    } catch (error) {
      console.warn('Failed to load app store from storage:', error)
    }
  }

  updateDeploymentConfig(config: Partial<DeploymentConfig>) {
    this.deploymentConfig = { ...this.deploymentConfig, ...config }
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
    this.deploymentConfig = {
      apiKey: '',
      workerName: 'worker-json-base',
      kvNamespace: 'JSONBIN',
    }
    this.deploymentSteps.forEach(step => {
      step.status = 'pending'
      step.error = undefined
    })
    this.currentStep = 0
    this.isLoading = false
    this.isDeployed = false
    localStorage.removeItem('jsonbase-app-store')
  }

  get currentStepData() {
    return this.deploymentSteps[this.currentStep]
  }

  get canProceed() {
    return this.deploymentSteps.every(step => step.status === 'completed')
  }
}

export const appStore = new AppStore()
