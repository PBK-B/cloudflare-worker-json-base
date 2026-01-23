import React from 'react'
import appStore from '../stores/AppStore'

interface DataItem {
  key: string
  value: string
  type: 'json' | 'text' | 'binary'
  size: number
  lastModified: Date
}

const WebUIConsole: React.FC = () => {
  const [data, setData] = React.useState<DataItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [showModal, setShowModal] = React.useState(false)
  const [editingKey, setEditingKey] = React.useState<string | null>(null)
  const [formValue, setFormValue] = React.useState({
    key: '',
    value: '',
  })

  React.useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      // Mock data for now
      const mockData: DataItem[] = [
        {
          key: '/demo/user/profile',
          value: '{"name":"John Doe","email":"john@example.com","age":30}',
          type: 'json',
          size: 54,
          lastModified: new Date('2024-01-15T10:30:00Z'),
        },
        {
          key: '/demo/config/settings',
          value: '{"theme":"dark","language":"zh-CN","notifications":true}',
          type: 'json',
          size: 58,
          lastModified: new Date('2024-01-14T15:45:00Z'),
        },
      ]
      setData(mockData)
    } catch (error) {
      alert('加载数据失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!formValue.key.trim() || !formValue.value.trim()) {
      alert('请填写完整信息')
      return
    }

    setLoading(true)
    try {
      // Simulate save
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      alert(editingKey ? '数据已更新' : '数据已保存')
      setShowModal(false)
      setEditingKey(null)
      setFormValue({ key: '', value: '' })
      loadData()
    } catch (error) {
      alert('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (item: DataItem) => {
    setEditingKey(item.key)
    setFormValue({
      key: item.key,
      value: item.value,
    })
    setShowModal(true)
  }

  const handleDelete = async (key: string) => {
    const message = '确定要删除 "' + key + '" 吗？此操作不可撤销。'
    if (window.confirm(message)) {
      try {
        alert('删除成功')
        loadData()
      } catch (error) {
        alert('删除失败')
      }
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'json':
        return '📝'
      case 'text':
        return '📄'
      case 'binary':
        return '📎'
      default:
        return '📎'
    }
  }

  const formatValue = (value: string, type: string) => {
    try {
      if (type === 'json') {
        const parsed = JSON.parse(value)
        return JSON.stringify(parsed, null, 2)
      }
    } catch {
      return value
    }
    
    return value.length > 100 ? value.substring(0, 100) + '...' : value
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* 工具栏 */}
      <div style={{ 
        background: 'white', 
        padding: '20px', 
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <button 
            onClick={() => {
              setEditingKey(null)
              setFormValue({ key: '', value: '' })
              setShowModal(true)
            }}
            style={{
              background: '#1890ff',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              marginRight: '10px'
            }}
          >
            ➕ 新增数据
          </button>
          
          <button 
            onClick={loadData}
            disabled={loading}
            style={{
              background: '#f5f5f5',
              color: '#666',
              border: '1px solid #d9d9d9',
              padding: '10px 20px',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            {loading ? '刷新中...' : '🔄 刷新'}
          </button>
        </div>
      </div>

      {/* 数据表格 */}
      <div style={{ 
        background: 'white', 
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafafa', borderBottom: '2px solid #e5e5e5' }}>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', color: '#666' }}>类型</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', color: '#666' }}>Key</th>
              <th style={{ padding: '12px', textAlign: 'left', fontWeight: 'bold', color: '#666' }}>Value</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#666' }}>数据类型</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#666' }}>大小</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#666' }}>最后修改</th>
              <th style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: '#666' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                  加载中...
                </td>
              </tr>
            ) : data.map((item) => (
              <tr key={item.key} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '12px', textAlign: 'center', fontSize: '16px' }}>
                  {getTypeIcon(item.type)}
                </td>
                <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px' }}>
                  {item.key}
                </td>
                <td style={{ 
                  padding: '12px', 
                  fontFamily: 'monospace', 
                  fontSize: '12px',
                  maxWidth: '300px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  <div style={{ 
                    maxHeight: '60px', 
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {formatValue(item.value, item.type)}
                  </div>
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <span style={{
                    background: item.type === 'json' ? '#f0f9f0' : 
                               item.type === 'text' ? '#e6f7ff' : '#fff7e6',
                    color: item.type === 'json' ? '#52c41a' : 
                           item.type === 'text' ? '#1890ff' : '#faad14',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}>
                    {item.type.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
                  {item.size} bytes
                </td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#666' }}>
                  {item.lastModified.toLocaleString()}
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <button
                    onClick={() => handleEdit(item)}
                    style={{
                      background: '#1890ff',
                      color: 'white',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      marginRight: '5px'
                    }}
                  >
                    ✏️ 编辑
                  </button>
                  <button
                    onClick={() => handleDelete(item.key)}
                    style={{
                      background: '#ff4d4f',
                      color: 'white',
                      border: 'none',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    🗑️ 删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 编辑/新增模态框 */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            width: '600px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <div style={{
              padding: '20px',
              borderBottom: '1px solid #e5e5e5'
            }}>
              <h2 style={{ margin: 0 }}>{editingKey ? '编辑数据' : '新增数据'}</h2>
            </div>
            
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Key</label>
                <input
                  type="text"
                  value={formValue.key}
                  onChange={(e) => setFormValue({...formValue, key: (e.target as HTMLInputElement).value})}
                  placeholder="例如: /demo/user/profile"
                  disabled={!!editingKey}
                  style={{ 
                    width: '100%', 
                    padding: '10px', 
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px'
                  }}
                />
                <div style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
                  建议使用路径格式，如 /demo/user/profile
                </div>
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Value</label>
                <textarea
                  value={formValue.value}
                  onChange={(e) => setFormValue({...formValue, value: (e.target as HTMLTextAreaElement).value})}
                  placeholder="输入 JSON 数据、文本或其他内容"
                  rows={10}
                  style={{ 
                    width: '100%', 
                    padding: '10px', 
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontFamily: 'monospace',
                    resize: 'vertical'
                  }}
                />
                <div style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
                  支持 JSON、文本和二进制数据（Base64 格式）
                </div>
              </div>
            </div>
            
            <div style={{
              padding: '20px',
              borderTop: '1px solid #e5e5e5',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px'
            }}>
              <button 
                onClick={() => setShowModal(false)}
                style={{
                  background: '#f5f5f5',
                  color: '#666',
                  border: '1px solid #d9d9d9',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                取消
              </button>
              <button 
                onClick={handleSave} 
                disabled={loading}
                style={{
                  background: loading ? '#ccc' : '#1890ff',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                {loading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WebUIConsole