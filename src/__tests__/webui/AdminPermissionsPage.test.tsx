import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, jest, beforeEach } from '@jest/globals'

jest.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key }),
}))

const apiMock = {
	listPermissionRules: jest.fn<any>(),
	createPermissionRule: jest.fn<any>(),
	updatePermissionRule: jest.fn<any>(),
	setPermissionRuleStatus: jest.fn<any>(),
	deletePermissionRule: jest.fn<any>(),
	evaluatePermissionRule: jest.fn<any>(),
}

jest.mock('../../hooks/useApi', () => ({
  useApi: () => apiMock,
}))

jest.mock('../../utils/notification', () => ({
  notify: {
    success: jest.fn(),
    error: jest.fn(),
  },
}))

describe('AdminPermissionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    apiMock.listPermissionRules.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'rule-1',
            pattern: '/public/**',
            mode: 'public_rw',
            priority: 100,
            enabled: true,
            description: 'public assets',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ],
      },
      timestamp: new Date().toISOString(),
    })
    apiMock.setPermissionRuleStatus.mockResolvedValue({ success: true, timestamp: new Date().toISOString() })
    apiMock.evaluatePermissionRule.mockResolvedValue({
      success: true,
      data: {
        path: '/public/example.txt',
        action: 'read',
        allowed: true,
        access: 'public',
        mode: 'public_rw',
        matchedRule: {
          id: 'rule-1',
          pattern: '/public/**',
          mode: 'public_rw',
          priority: 100,
          enabled: true,
          description: 'public assets',
          created_at: '2024-01-01T00:00:00.000Z',
          updated_at: '2024-01-01T00:00:00.000Z',
        },
      },
      timestamp: new Date().toISOString(),
    })
  })

  it('renders rules and evaluates path access', async () => {
		const { default: AdminPermissionsPage } = await import('../../pages/admin/AdminPermissionsPage')
		render(<AdminPermissionsPage />)

		await waitFor(() => expect(apiMock.listPermissionRules).toHaveBeenCalled())

		fireEvent.click(screen.getByText('开始测试'))

		await waitFor(() => expect(apiMock.evaluatePermissionRule).toHaveBeenCalled())
		expect(screen.getByText('当前操作为公开访问')).toBeTruthy()
	})
})
