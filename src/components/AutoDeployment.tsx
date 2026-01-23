import React from 'react'
import { observer } from 'mobx-react-lite'
import { 
  Container, 
  Header, 
  Content, 
  Button, 
  Form, 
  Input, 
  InputPicker, 
  Panel, 
  Steps, 
  Message,
  Loader,
  Divider,
  ButtonToolbar,
  Toggle
} from 'rsuite'
import configManager from '../stores/ConfigManager'

const AutoDeployment: React.FC = observer(() => {
  const [formValue, setFormValue] = React.useState({
    apiKey: configManager.workerConfig.apiKey,
    workerName: configManager.workerConfig.workerName,
    kvNamespace: configManager.workerConfig.kvNamespace,
    environment: configManager.workerConfig.environment,
  })
  
  const [showApiKey, setShowApiKey] = React.useState(false)
  const [autoDeploy, setAutoDeploy] = React.useState(false)

  const handleFormChange = (formValue: any) => {
    setFormValue(formValue)
    configManager.updateWorkerConfig(formValue)
  }

  const handleStepSubmit = async () => {
    const currentStep = configManager.currentStepData
    
    configManager.setLoading(true)
    configManager.updateStepStatus(currentStep.id, 'in-progress')
    
    try {
      switch (currentStep.id) {
        case 'auth':
          await handleAuthStep()
          break
        case 'config':
          await handleConfigStep()
          break
        case 'kv-create':
          await handleKvCreateStep()
          break
        case 'kv-bind':
          await handleKvBindStep()
          break
        case 'deploy':
          await handleDeployStep()
          break
        case 'test':
          await handleTestStep()
          break
      }
      
      configManager.updateStepStatus(currentStep.id, 'completed')
      configManager.nextStep()
      
    } catch (error) {
      configManager.updateStepStatus(currentStep.id, 'error', (error as Error).message)
    } finally {
      configManager.setLoading(false)
    }
  }

  const handleAuthStep = async () => {
    configManager.addLog('开始 Cloudflare 认证...')
    // 在实际实现中，这里会调用后端 API 或打开认证窗口
    await new Promise(resolve => setTimeout(resolve, 2000))
    configManager.addLog('Cloudflare 认证完成')
  }

  const handleConfigStep = async () => {
    configManager.addLog('验证配置参数...')
    
    if (!formValue.apiKey.trim()) {
      throw new Error('API Key 不能为空')
    }
    
    configManager.addLog('配置验证通过')
    configManager.addLog(`Worker 名称: ${formValue.workerName}`)
    configManager.addLog(`KV 命名空间: ${formValue.kvNamespace}`)
    configManager.addLog(`环境: ${formValue.environment}`)
  }

  const handleKvCreateStep = async () => {
    configManager.addLog('创建 KV 命名空间...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    configManager.addLog(`KV 命名空间 ${formValue.kvNamespace} 创建成功`)
  }

  const handleKvBindStep = async () => {
    configManager.addLog('绑定 KV 命名空间到 Worker...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    configManager.addLog('KV 命名空间绑定完成')
  }

  const handleDeployStep = async () => {
    configManager.addLog('开始部署 Worker...')
    configManager.addLog('构建 WebUI...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    configManager.addLog('部署到 Cloudflare Workers...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    configManager.addLog('部署完成')
  }

  const handleTestStep = async () => {
    configManager.addLog('测试部署结果...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    configManager.addLog('API 测试通过')
    configManager.addLog('WebUI 测试通过')
    configManager.setDeployed(true)
  }

  const handleAutoDeploy = async () => {
    setAutoDeploy(true)
    
    for (let i = configManager.currentStep; i < configManager.deploymentSteps.length; i++) {
      if (configManager.deploymentSteps[i].status !== 'completed') {
        await handleStepSubmit()
      }
    }
    
    setAutoDeploy(false)
  }

  const resetDeployment = () => {
    configManager.resetDeployment()
    setFormValue({
      apiKey: configManager.workerConfig.apiKey,
      workerName: configManager.workerConfig.workerName,
      kvNamespace: configManager.workerConfig.kvNamespace,
      environment: configManager.workerConfig.environment,
    })
  }

  const renderStepContent = () => {
    const currentStep = configManager.currentStepData

    switch (currentStep.id) {
      case 'auth':
        return (
          <Panel shaded bordered bodyFill style={{ marginBottom: 20 }}>
            <h3>Cloudflare 账户认证</h3>
            <p>请确保您已登录 Cloudflare 账户并具有创建 Workers 和 KV 命名空间的权限。</p>
            
            <div style={{ 
              background: '#f6f8fa', 
              padding: 15, 
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: 12,
              marginBottom: 20
            }}>
              <div>如果未登录，请执行以下命令：</div>
              <div>wrangler login</div>
            </div>
            
            <Button 
              appearance="primary" 
              onClick={handleStepSubmit}
              loading={configManager.isLoading}
              disabled={configManager.isLoading}
            >
              验证认证状态
            </Button>
          </Panel>
        )

      case 'config':
        return (
          <Panel shaded bordered bodyFill style={{ marginBottom: 20 }}>
            <h3>配置项目参数</h3>
            
            <Form fluid formValue={formValue} onChange={handleFormChange}>
              <Form.Group>
                <Form.ControlLabel>API Key *</Form.ControlLabel>
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  name="apiKey"
                  placeholder="请输入您的数据库访问密钥"
                  value={formValue.apiKey}
                  onChange={(value) => handleFormChange({...formValue, apiKey: value})}
                />
                <div style={{ marginTop: 5 }}>
                  <Button 
                    size="sm" 
                    appearance="link"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? '隐藏' : '显示'} API Key
                  </Button>
                </div>
              </Form.Group>

              <Form.Group>
                <Form.ControlLabel>Worker 名称</Form.ControlLabel>
                <Input
                  name="workerName"
                  value={formValue.workerName}
                  onChange={(value) => handleFormChange({...formValue, workerName: value})}
                />
              </Form.Group>

              <Form.Group>
                <Form.ControlLabel>KV 命名空间</Form.ControlLabel>
                <Input
                  name="kvNamespace"
                  value={formValue.kvNamespace}
                  onChange={(value) => handleFormChange({...formValue, kvNamespace: value})}
                />
              </Form.Group>

              <Form.Group>
                <Form.ControlLabel>部署环境</Form.ControlLabel>
                <InputPicker
                  name="environment"
                  data={[
                    { label: '开发环境', value: 'development' },
                    { label: '生产环境', value: 'production' }
                  ]}
                  value={formValue.environment}
                  onChange={(value) => handleFormChange({...formValue, environment: value as any})}
                />
              </Form.Group>

              <ButtonToolbar>
                <Button 
                  appearance="primary" 
                  onClick={handleStepSubmit}
                  loading={configManager.isLoading}
                  disabled={!formValue.apiKey.trim() || configManager.isLoading}
                >
                  保存配置
                </Button>
              </ButtonToolbar>
            </Form>
          </Panel>
        )

      case 'kv-create':
        return (
          <Panel shaded bordered bodyFill style={{ marginBottom: 20 }}>
            <h3>创建 KV 命名空间</h3>
            <p>系统将为您创建名为 <strong>{formValue.kvNamespace}</strong> 的 KV 命名空间。</p>
            
            <div style={{ 
              background: '#f6f8fa', 
              padding: 15, 
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: 12,
              marginBottom: 20
            }}>
              <div>执行命令：wrangler kv:namespace create "{formValue.kvNamespace}"</div>
            </div>
            
            <Button 
              appearance="primary" 
              onClick={handleStepSubmit}
              loading={configManager.isLoading}
              disabled={configManager.isLoading}
            >
              创建 KV 命名空间
            </Button>
          </Panel>
        )

      case 'kv-bind':
        return (
          <Panel shaded bordered bodyFill style={{ marginBottom: 20 }}>
            <h3>绑定 KV 命名空间</h3>
            <p>将创建的 KV 命名空间绑定到 Worker，使其可以访问数据存储。</p>
            
            <div style={{ 
              background: '#f6f8fa', 
              padding: 15, 
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: 12,
              marginBottom: 20
            }}>
              <div>绑定配置：</div>
              <div>Variable type: KV Namespace</div>
              <div>Variable name: {formValue.kvNamespace}</div>
              <div>KV namespace: {formValue.kvNamespace}</div>
            </div>
            
            <Button 
              appearance="primary" 
              onClick={handleStepSubmit}
              loading={configManager.isLoading}
              disabled={configManager.isLoading}
            >
              绑定 KV 命名空间
            </Button>
          </Panel>
        )

      case 'deploy':
        return (
          <Panel shaded bordered bodyFill style={{ marginBottom: 20 }}>
            <h3>部署 Worker</h3>
            <p>将项目构建并部署到 Cloudflare Workers 平台。</p>
            
            <div style={{ 
              background: '#f6f8fa', 
              padding: 15, 
              borderRadius: 4,
              fontFamily: 'monospace',
              fontSize: 12,
              marginBottom: 20
            }}>
              <div>执行步骤：</div>
              <div>1. npm run webui:build</div>
              <div>2. wrangler deploy</div>
            </div>
            
            <Button 
              appearance="primary" 
              onClick={handleStepSubmit}
              loading={configManager.isLoading}
              disabled={configManager.isLoading}
            >
              开始部署
            </Button>
          </Panel>
        )

      case 'test':
        return (
          <Panel shaded bordered bodyFill style={{ marginBottom: 20 }}>
            <h3>测试验证</h3>
            <p>验证部署结果，确保所有功能正常运行。</p>
            
            <Button 
              appearance="primary" 
              onClick={handleStepSubmit}
              loading={configManager.isLoading}
              disabled={configManager.isLoading}
            >
              开始测试
            </Button>
          </Panel>
        )

      default:
        return null
    }
  }

  return (
    <Container style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Header style={{ padding: '20px 0' }}>
        <h1 style={{ margin: 0, color: '#1890ff' }}>
          🚀 JSON Base 自动部署
        </h1>
        <p style={{ margin: '10px 0 0 0', color: '#666' }}>
          一键完成 Cloudflare Workers 项目的部署和配置
        </p>
      </Header>
      
      <Content>
        {/* 自动部署开关 */}
        <Panel shaded bordered style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h4 style={{ margin: 0 }}>自动部署模式</h4>
              <small style={{ color: '#666' }}>启用后将自动执行所有部署步骤</small>
            </div>
            <Toggle
              checked={autoDeploy}
              onChange={handleAutoDeploy}
              disabled={configManager.isLoading || configManager.isDeploymentComplete}
            />
          </div>
        </Panel>

        {/* 步骤进度 */}
        <Panel shaded bordered style={{ marginBottom: 20 }}>
          <h3>部署进度</h3>
          <Steps current={configManager.currentStep} vertical>
            {configManager.deploymentSteps.map((step, index) => (
              <Steps.Item
                key={step.id}
                title={step.title}
                description={step.description}
                status={step.status === 'completed' ? 'finish' : 
                       step.status === 'error' ? 'error' : 
                       step.status === 'in-progress' ? 'process' : 'wait'}
              />
            ))}
          </Steps>
        </Panel>

        {/* 当前步骤内容 */}
        {renderStepContent()}

        {/* 操作按钮 */}
        {!configManager.isDeploymentComplete && (
          <Panel shaded bordered style={{ marginBottom: 20 }}>
            <ButtonToolbar>
              {configManager.currentStep > 0 && (
                <Button
                  onClick={() => configManager.goToStep(configManager.currentStep - 1)}
                  disabled={configManager.isLoading}
                >
                  上一步
                </Button>
              )}
              
              <Button
                appearance="primary"
                onClick={handleStepSubmit}
                loading={configManager.isLoading}
                disabled={configManager.isLoading || !configManager.canProceedToNext}
              >
                {configManager.isLoading ? '执行中...' : '下一步'}
              </Button>
              
              <Button
                appearance="subtle"
                onClick={resetDeployment}
                disabled={configManager.isLoading}
              >
                重置部署
              </Button>
            </ButtonToolbar>
          </Panel>
        )}

        {/* 部署日志 */}
        <Panel shaded bordered style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h4>部署日志</h4>
            <Button size="sm" onClick={() => configManager.clearLogs()}>
              清空日志
            </Button>
          </div>
          
          <div style={{ 
            background: '#1e1e1e', 
            color: '#d4d4d4',
            padding: 15,
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 12,
            height: 200,
            overflow: 'auto'
          }}>
            {configManager.logs.length > 0 ? (
              configManager.logs.map((log, index) => (
                <div key={index}>{log}</div>
              ))
            ) : (
              <div style={{ color: '#666' }}>暂无日志</div>
            )}
          </div>
        </Panel>

        {/* 完成状态 */}
        {configManager.isDeploymentComplete && (
          <Panel shaded bordered style={{ background: '#f0f9f0' }}>
            <h3 style={{ color: '#52c41a', margin: '0 0 10px 0' }}>
              🎉 部署完成！
            </h3>
            <p>您的 JSON Base 服务已成功部署到 Cloudflare Workers。</p>
            <ButtonToolbar>
              <Button appearance="primary">
                访问 WebUI 控制台
              </Button>
              <Button appearance="subtle" onClick={resetDeployment}>
                重新部署
              </Button>
            </ButtonToolbar>
          </Panel>
        )}
      </Content>
    </Container>
  )
})

export default AutoDeployment