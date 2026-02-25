import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, FileText, Paperclip, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../hooks/useApi';
import '../../styles/WebUIConsole.less';

interface AdminContext {
	onOpenCreateModal: (defaultType?: 'json' | 'text' | 'binary') => void;
	onOpenEditModal: (data: any) => void;
	refreshKey?: number;
}

const AdminConsolePage: React.FC = () => {
	const { onOpenCreateModal, refreshKey } = useOutletContext<AdminContext>();
	const { listData, getConsoleStats, loading } = useApi();
	const { t } = useTranslation();

	const [stats, setStats] = useState({
		totalCount: 0,
		totalSize: 0,
		pageCount: 0,
	});

	const loadStats = useCallback(async () => {
		try {
			const response = await getConsoleStats();
			if (response.success && response.data) {
				setStats({
					totalCount: response.data.totalCount || response.data.totalFiles || 0,
					totalSize: response.data.totalSize || 0,
					pageCount: response.data.pageCount || Math.ceil((response.data.totalCount || 0) / 20),
				});
			}
		} catch (err) {
			console.error(t('api.consoleStatsFailed', { defaultValue: "获取控制台统计失败" }), err);
		}
	}, [getConsoleStats]);

	useEffect(() => {
		loadStats();
	}, [loadStats, refreshKey]);

	const formatSize = (bytes: number) => {
		if (bytes === 0) return '0 B';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	return (
		<div className="admin-console-page">
			<div className="admin-section">
				<div className="stats-container">
					<div className="stat-item">
						<span className="stat-number">{stats.totalCount}</span>
						<span className="stat-label">{t('console.stats.totalCount', { defaultValue: "数据总数" })}</span>
					</div>
					<div className="stat-item">
						<span className="stat-number">{formatSize(stats.totalSize)}</span>
						<span className="stat-label">{t('console.stats.totalSize', { defaultValue: "存储大小" })}</span>
					</div>
					<div className="stat-item">
						<span className="stat-number">{stats.pageCount}</span>
						<span className="stat-label">{t('console.stats.pageCount', { defaultValue: "总页数" })}</span>
					</div>
				</div>

				<div className="quick-actions">
					<div className="action-card" onClick={() => onOpenCreateModal('json')}>
						<span className="action-icon">
							<Plus size={24} />
						</span>
						<div className="action-title">{t('console.actions.create.title', { defaultValue: "创建数据" })}</div>
						<div className="action-description">{t('console.actions.create.description', { defaultValue: "快速创建新的 JSON 数据" })}</div>
					</div>
					<div className="action-card" onClick={() => onOpenCreateModal('text')}>
						<span className="action-icon">
							<FileText size={24} />
						</span>
						<div className="action-title">{t('console.actions.storeText.title', { defaultValue: "存储文本" })}</div>
						<div className="action-description">{t('console.actions.storeText.description', { defaultValue: "存储纯文本内容" })}</div>
					</div>
					<div className="action-card" onClick={() => onOpenCreateModal('binary')}>
						<span className="action-icon">
							<Paperclip size={24} />
						</span>
						<div className="action-title">{t('console.actions.upload.title', { defaultValue: "上传文件" })}</div>
						<div className="action-description">{t('console.actions.upload.description', { defaultValue: "存储二进制文件数据" })}</div>
					</div>
					<div className="action-card">
						<span className="action-icon">
							<Database size={24} />
						</span>
						<div className="action-title">{t('console.actions.manage.title', { defaultValue: "数据管理" })}</div>
						<div className="action-description">{t('console.actions.manage.description', { defaultValue: "查看和管理所有数据" })}</div>
					</div>
				</div>

				<div className="console-card">
					<h4>{t('console.apiTestTitle', { defaultValue: "API 测试工具" })}</h4>
					<p>{t('console.apiTestDescription', { defaultValue: "在数据管理中使用创建和查询功能来测试 API。" })}</p>

					<div className="console-card-code">
						<h5>{t('console.quickApiExample', { defaultValue: "快速 API 示例" })}</h5>
						<pre className="console-code-block">
							{t('console.quickApiSample', { defaultValue: "创建数据:\nPOST /data/example\nAuthorization: Bearer YOUR_API_KEY\n{\"name\": \"example\", \"value\": \"data\"}\n\n获取数据:\nGET /data/example\nAuthorization: Bearer YOUR_API_KEY\n-> {\"name\": \"example\", \"value\": \"data\"}\n" })}
						</pre>
					</div>
				</div>
			</div>
		</div>
	);
};

export default AdminConsolePage;
