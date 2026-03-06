import React from 'react'
import ReactDOM from 'react-dom/client'
import 'rsuite/styles/index.less'
import './styles/index.scss'
import './i18n'

import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
