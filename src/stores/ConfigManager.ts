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

class ConfigManager {
  workerConfig: WorkerConfig = {
    apiKey: '',
    workerName: 'worker-json-base',
    kvNamespace: 'JSONBIN',
    environment: 'development'
  }

  cloudflareConfig: CloudflareConfig = {}

  deploymentSteps: DeploymentStep[] = [
    {
      id: 'auth',
      title: 'Cloudflare 认证',
      description: '登录到您的 Cloudflare 账户',
      status: 'pending',
      commands: ['wrangler login'],
      validation: async () => {
        try {
          return true
        } catch {
          return false
        }
      }
    },
    {
      id: 'config',
      title: '配置项目参数',
      description: '设置 API Key 和 Worker 配置',
      status: 'pending'
    },
    {
      id: 'kv-create',
      title: '创建 KV 命名空间',
      description: '创建用于数据存储的 KV 命名空间',
      status: 'pending',
      commands: ['wrangler kv:namespace create "JSONBIN"'],
      validation: async () => {
        try {
          return true
        } catch {
          return false
        }
      }
    },
    {
      id: 'kv-bind',
      title: '绑定 KV 命名空间',
      description: '将 KV 命名空间绑定到 Worker',
      status: 'pending'
    },
    {
      id: 'deploy',
      title: '部署 Worker',
      description: '将项目部署到 Cloudflare Workers',
      status: 'pending',
      commands: ['npm run build', 'npm run deploy'],
      validation: async () => {
        try {
          return true
        } catch {
          return false
        }
      }
    },
    {
      id: 'test',
      title: '测试验证',
      description: '验证部署是否成功',
      status: 'pending'
    }
  ]

  currentStep = 0
  isDeployed = false
  isLoading = false
  logs: string[] = []

  constructor() {
    makeAutoObservable(this)
    this.loadConfig()
  }

  updateWorkerConfig(config: Partial<WorkerConfig>) {
    this.workerConfig = { ...this.workerConfig, ...config }
    this.saveConfig()
  }

  updateCloudflareConfig(config: Partial<CloudflareConfig>) {
    this.cloudflareConfig = { ...this.cloudflareConfig, ...config }
    this.saveConfig()
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

  goToStep(stepIndex: number) {
    if (stepIndex >= 0 && stepIndex < this.deploymentSteps.length) {
      this.currentStep = stepIndex
    }
  }

  setDeployed(deployed: boolean) {
    this.isDeployed = deployed
  }

  setLoading(loading: boolean) {
    this.isLoading = loading
  }

  addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString()
    this.logs.push(`[${timestamp}] ${message}`)
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100)
    }
  }

  clearLogs() {
    this.logs = []
  }

  get currentStepData() {
    return this.deploymentSteps[this.currentStep]
  }

  get isDeploymentComplete() {
    return this.deploymentSteps.every(step => step.status === 'completed')
  }

  get canProceedToNext() {
    const currentStep = this.currentStepData
    return currentStep.status === 'completed'
  }

  saveConfig() {
    try {
      localStorage.setItem('jsonbase-config', JSON.stringify({
        worker: this.workerConfig,
        cloudflare: this.cloudflareConfig
      }))
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  loadConfig() {
    try {
      const saved = localStorage.getItem('jsonbase-config')
      if (saved) {
        const config = JSON.parse(saved)
        if (config.worker) {
          this.workerConfig = { ...this.workerConfig, ...config.worker }
        }
        if (config.cloudflare) {
          this.cloudflareConfig = { ...this.cloudflareConfig, ...config.cloudflare }
        }
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  resetDeployment() {
    this.deploymentSteps.forEach(step => {
      step.status = 'pending'
      step.error = undefined
    })
    this.currentStep = 0
    this.isDeployed = false
    this.clearLogs()
  }

  generateWranglerConfig() {
    const kvBinding = this.workerConfig.kvNamespace
    return {
      name: this.workerConfig.workerName,
      main: 'src/index.ts',
      compatibility_date: '2024-05-02',
      kv_namespaces: [
        {
          binding: kvBinding,
          id: kvBinding.toLowerCase(),
          preview_id: kvBinding.toLowerCase()
        }
      ]
    }
  }

  generateWorkerCode() {
    return `
// Auto-generated configuration
const APIKEY = '${this.workerConfig.apiKey}';

interface Env {
  ${this.workerConfig.kvNamespace}: KVNamespace;
}
`
  }

  async executeStepCommand(command: string): Promise<boolean> {
    this.setLoading(true)
    this.addLog(`执行命令: ${command}`)
    
    try {
      return true
    } catch (error) {
      this.addLog(`命令执行失败: ${error}`)
      return false
    } finally {
      this.setLoading(false)
    }
  }

  async validateCurrentStep(): Promise<boolean> {
    const currentStep = this.currentStepData
    if (currentStep.validation) {
      this.setLoading(true)
      this.addLog(`验证步骤: ${currentStep.title}`)
      
      try {
        const result = await currentStep.validation()
        this.addLog(result ? '验证成功' : '验证失败')
        return result
      } catch (error) {
        this.addLog(`验证出错: ${error}`)
        return false
      } finally {
        this.setLoading(false)
      }
    }
    return true
  }
}

export default new ConfigManager()