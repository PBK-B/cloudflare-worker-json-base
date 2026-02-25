import React from 'react'
import ReactDOM from 'react-dom/client'
import { Container, Header, Content } from 'rsuite'
import 'rsuite/styles/index.less'
import './styles/index.less'
import './i18n'

import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
