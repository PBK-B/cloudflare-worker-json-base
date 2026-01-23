import React from 'react'
import { Container, Header, Content, Button, Panel } from 'rsuite'
import { useTheme } from './hooks/useTheme'
import WebUIConsole from './components/WebUIConsole'
import './styles/App.less'

const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme()

  return (
    <Container className="app-container">
      <Header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <h1>JSON Base - WebUI Console</h1>
            <p>Cloudflare Workers JSON 存储服务管理控制台 v2.0.0</p>
          </div>
          <div className="header-actions">
            <Button appearance="subtle" onClick={toggleTheme}>
              {theme === 'light' ? '🌙' : '☀️'}
            </Button>
          </div>
        </div>
      </Header>
      
      <Content className="main-content">
        <Panel shaded bordered>
          <WebUIConsole />
        </Panel>
      </Content>
    </Container>
  )
}

export default App