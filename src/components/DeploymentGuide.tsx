import React from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import appStore from '../stores/AppStore'
import { notify } from '../utils/notification'

const DeploymentGuide: React.FC = observer(() => {
  const { t } = useTranslation()
  const [formValue, setFormValue] = React.useState({
    apiKey: '',
    workerName: 'worker-json-base',
    kvNamespace: 'JSONBIN',
  })
  const [showApiKey, setShowApiKey] = React.useState(false)

  const handleConfigSubmit = async () => {
    if (!formValue.apiKey.trim()) {
      notify.warning(t('deploymentGuide.notifications.apiKeyRequired', { defaultValue: "请输入 API Key" }))
      return
    }

    appStore.setLoading(true)
    appStore.updateConfig(formValue)
    appStore.updateStepStatus('config', 'completed')
    
    setTimeout(() => {
      appStore.setLoading(false)
      appStore.nextStep()
      notify.success(t('deploymentGuide.notifications.configSaved', { defaultValue: "配置已保存，请继续下一步" }))
    }, 1000)
  }

  const handleStepComplete = (stepId: string) => {
    appStore.updateStepStatus(stepId, 'completed')
    appStore.nextStep()
  }

  const handleDeployComplete = () => {
    appStore.updateStepStatus('deploy', 'completed')
    appStore.setDeployed(true)
    notify.success(t('deploymentGuide.notifications.deployComplete', { defaultValue: "部署完成！WebUI 控制台已准备就绪" }))
  }

  const renderStepContent = () => {
    const { currentStepData } = appStore

    switch (currentStepData.id) {
      case 'config':
        return (
          <div style={{ 
            background: 'white', 
            padding: '20px', 
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginBottom: '20px'
          }}>
            <h2>{t('deploymentGuide.step1.title', { defaultValue: "步骤 1: 配置 API Key" })}</h2>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>{t('deploymentGuide.step1.apiKey', { defaultValue: "API Key" })}</label>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={formValue.apiKey}
                onChange={(e) => setFormValue({...formValue, apiKey: (e.target as HTMLInputElement).value})}
                placeholder={t('deploymentGuide.step1.apiKeyPlaceholder', { defaultValue: "请输入您的数据库访问密钥" })}
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
              <div style={{ marginTop: '5px' }}>
                <button 
                  onClick={() => setShowApiKey(!showApiKey)}
                  style={{ background: 'none', border: 'none', color: '#1890ff', cursor: 'pointer' }}
                >
                  {showApiKey ? t('deploymentGuide.step1.hide', { defaultValue: "隐藏" }) : t('deploymentGuide.step1.show', { defaultValue: "显示" })} {t('deploymentGuide.step1.apiKey', { defaultValue: "API Key" })}
                </button>
              </div>
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>{t('deploymentGuide.step1.workerName', { defaultValue: "Worker 名称" })}</label>
              <input
                type="text"
                value={formValue.workerName}
                disabled
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  background: '#f5f5f5'
                }}
              />
            </div>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>{t('deploymentGuide.step1.kvNamespace', { defaultValue: "KV 命名空间" })}</label>
              <input
                type="text"
                value={formValue.kvNamespace}
                disabled
                style={{ 
                  width: '100%', 
                  padding: '10px', 
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                  background: '#f5f5f5'
                }}
              />
            </div>
            
            <button 
              onClick={handleConfigSubmit}
              disabled={!formValue.apiKey.trim() || appStore.isLoading}
              style={{
                background: formValue.apiKey.trim() && !appStore.isLoading ? '#1890ff' : '#ccc',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {appStore.isLoading ? t('deploymentGuide.step1.saving', { defaultValue: "保存中..." }) : t('deploymentGuide.step1.save', { defaultValue: "保存配置" })}
            </button>
          </div>
        )

      case 'kv-bind':
        return (
          <div style={{ 
            background: 'white', 
            padding: '20px', 
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginBottom: '20px'
          }}>
            <h2>{t('deploymentGuide.step2.title', { defaultValue: "步骤 2: 绑定 KV 命名空间" })}</h2>
            
            <div style={{ marginBottom: '20px' }}>
              <h3>{t('deploymentGuide.step2.instructions', { defaultValue: "操作步骤：" })}</h3>
              <ol style={{ paddingLeft: '20px' }}>
                <li style={{ marginBottom: '10px' }}>
                  {t('deploymentGuide.step2.login', { defaultValue: "登录" })} <a href="https://dash.cloudflare.com/" target="_blank" rel="noopener noreferrer">{t('deploymentGuide.step2.cloudflareDashboard', { defaultValue: "Cloudflare Dashboard" })}</a>
                </li>
                <li style={{ marginBottom: '10px' }}>
                  {t('deploymentGuide.step2.navigateKv', { defaultValue: "导航到 Workers and Pages -> KV -> Create namespace" })}
                </li>
                <li style={{ marginBottom: '10px' }}>
                  {t('deploymentGuide.step2.addBinding', { defaultValue: "在 Workers and Pages -> worker-json-base -> Settings -> Variables 中添加 KV 绑定" })}
                </li>
              </ol>
            </div>
            
            <div style={{ 
              background: '#f6f8fa', 
              padding: '15px', 
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              marginBottom: '20px'
            }}>
              <div>{t('deploymentGuide.step2.envConfig', { defaultValue: "环境变量配置：" })}</div>
              <div>{t('deploymentGuide.step2.variableType', { defaultValue: "Variable type: KV Namespace" })}</div>
              <div>{t('deploymentGuide.step2.variableName', { defaultValue: "Variable name: JSONBIN" })}</div>
              <div>{t('deploymentGuide.step2.kvSelect', { defaultValue: "KV namespace: 选择您创建的命名空间" })}</div>
            </div>
            
            <button 
              onClick={() => handleStepComplete('kv-bind')}
              style={{
                background: '#1890ff',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {t('deploymentGuide.step2.done', { defaultValue: "我已完成 KV 绑定" })}
            </button>
          </div>
        )

      case 'deploy':
        return (
          <div style={{ 
            background: 'white', 
            padding: '20px', 
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginBottom: '20px'
          }}>
            <h2>{t('deploymentGuide.step3.title', { defaultValue: "步骤 3: 部署 Worker" })}</h2>
            
            <div style={{ 
              background: '#f6f8fa', 
              padding: '15px', 
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              marginBottom: '20px'
            }}>
              <div>{t('deploymentGuide.step3.installDeps', { defaultValue: "安装依赖：" })}</div>
              <div>{t('deploymentGuide.step3.commandInstall', { defaultValue: "npm install" })}</div>
              <br/>
              <div>{t('deploymentGuide.step3.deployToCf', { defaultValue: "部署到 Cloudflare Workers：" })}</div>
              <div>{t('deploymentGuide.step3.commandDeploy', { defaultValue: "npm run deploy" })}</div>
            </div>
            
            <div style={{ 
              background: '#fff7e6', 
              padding: '15px', 
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <strong>{t('deploymentGuide.step3.notice', { defaultValue: "注意：" })}</strong>{t('deploymentGuide.step3.firstDeployLogin', { defaultValue: "首次部署需要登录 Cloudflare 账户" })}
              <div style={{ 
                background: '#f6f8fa', 
                padding: '10px', 
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
                marginTop: '10px'
              }}>
                {t('deploymentGuide.step3.commandLogin', { defaultValue: "wrangler login" })}
              </div>
            </div>
            
            <button 
              onClick={handleDeployComplete}
              style={{
                background: '#1890ff',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              {t('deploymentGuide.step3.next', { defaultValue: "部署完成，进入下一步" })}
            </button>
          </div>
        )

      case 'test':
        return (
          <div style={{ 
            background: 'white', 
            padding: '20px', 
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            marginBottom: '20px'
          }}>
            <h2>{t('deploymentGuide.step4.title', { defaultValue: "步骤 4: 测试功能" })}</h2>
            
            <div style={{ 
              background: '#f6ffed', 
              padding: '15px', 
              borderRadius: '4px',
              marginBottom: '20px',
              border: '1px solid #b7eb8f'
            }}>
              {t('deploymentGuide.step4.ready', { defaultValue: "🎉 恭喜！您的 JSON Base 服务已准备就绪" })}
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <h3>{t('deploymentGuide.step4.validation', { defaultValue: "功能验证：" })}</h3>
              <ul style={{ paddingLeft: '20px' }}>
                <li style={{ marginBottom: '10px' }}>
                  <strong>✓</strong> {t('deploymentGuide.step4.apiTest', { defaultValue: "API 接口测试" })}
                </li>
                <li style={{ marginBottom: '10px' }}>
                  <strong>✓</strong> {t('deploymentGuide.step4.webui', { defaultValue: "WebUI 控制台" })}
                </li>
              </ul>
            </div>
            
            <button 
              onClick={() => handleStepComplete('test')}
              style={{
                background: '#52c41a',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              {t('deploymentGuide.step4.openWebui', { defaultValue: "进入 WebUI 控制台" })}
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '20px auto' }}>
      <div style={{ 
        background: 'white', 
        padding: '20px', 
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h1 style={{ margin: '0 0 10px 0', color: '#1890ff' }}>
          {t('deploymentGuide.title', { defaultValue: "🚀 部署引导" })}
        </h1>
        <p style={{ margin: '0 0 20px 0', color: '#666' }}>
          {t('deploymentGuide.subtitle', { defaultValue: "按照以下步骤快速部署您的 JSON Base 服务" })}
        </p>
      </div>

      {/* 步骤指示器 */}
      <div style={{ display: 'flex', marginBottom: '20px', gap: '10px' }}>
        {appStore.deploymentSteps.map((step, index) => (
          <div
            key={step.id}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '10px',
              borderRadius: '6px',
              background: step.status === 'completed' ? '#f0f9f0' : 
                         step.status === 'in-progress' ? '#e6f7ff' : '#f5f5f5',
              border: step.status === 'in-progress' ? '2px solid #1890ff' : 
                     step.status === 'completed' ? '2px solid #52c41a' : '2px solid #d9d9d9',
              cursor: 'pointer',
            }}
            onClick={() => {
              if (index <= appStore.currentStep) {
                appStore.currentStep = index
              }
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: step.status === 'completed' ? '#52c41a' : 
                           step.status === 'in-progress' ? '#1890ff' : '#d9d9d9',
                color: 'white',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 'bold',
                marginBottom: 5,
              }}
            >
              {step.status === 'completed' ? '✓' : index + 1}
            </div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>
              {step.title}
            </div>
          </div>
        ))}
      </div>

      {/* 当前步骤内容 */}
      {renderStepContent()}
    </div>
  )
})

export default DeploymentGuide
