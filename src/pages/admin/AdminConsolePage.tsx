import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, FileText, Paperclip, Database } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import '../../styles/WebUIConsole.less';

interface AdminContext {
	onOpenCreateModal: () => void;
	onOpenEditModal: (data: any) => void;
	refreshKey?: number;
}

const AdminConsolePage: React.FC = () => {
	const { onOpenCreateModal, refreshKey } = useOutletContext<AdminContext>();
	const { listData, loading } = useApi();

	const [stats, setStats] = useState({
		totalCount: 0,
		totalSize: 0,
		pageCount: 0,
	});

	const loadStats = useCallback(async () => {
		try {
			const response = await listData(1, 20);
			if (response.success && response.data) {
				setStats({
					totalCount: response.data.total,
					totalSize: 0,
					pageCount: Math.ceil(response.data.total / 20),
				});
			}
		} catch (err) {
			console.error('加载统计数据失败:', err);
		}
	}, [listData]);

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
						<span className="stat-label">数据总数</span>
					</div>
					<div className="stat-item">
						<span className="stat-number">{formatSize(stats.totalSize)}</span>
						<span className="stat-label">存储大小</span>
					</div>
					<div className="stat-item">
						<span className="stat-number">{stats.pageCount}</span>
						<span className="stat-label">总页数</span>
					</div>
				</div>

				<div className="quick-actions">
					<div className="action-card" onClick={onOpenCreateModal}>
						<span className="action-icon">
							<Plus size={24} />
						</span>
						<div className="action-title">创建数据</div>
						<div className="action-description">快速创建新的JSON数据</div>
					</div>
					<div className="action-card" onClick={onOpenCreateModal}>
						<span className="action-icon">
							<FileText size={24} />
						</span>
						<div className="action-title">存储文本</div>
						<div className="action-description">存储纯文本内容</div>
					</div>
					<div className="action-card" onClick={onOpenCreateModal}>
						<span className="action-icon">
							<Paperclip size={24} />
						</span>
						<div className="action-title">上传文件</div>
						<div className="action-description">存储二进制文件数据</div>
					</div>
					<div className="action-card">
						<span className="action-icon">
							<Database size={24} />
						</span>
						<div className="action-title">数据管理</div>
						<div className="action-description">查看和管理所有数据</div>
					</div>
				</div>

				<div className="console-card">
					<h4>API 测试工具</h4>
					<p>在数据管理中使用创建和查询功能来测试API。</p>

					<div className="console-card-code">
						<h5>快速API示例</h5>
						<pre className="console-code-block">
							{`创建数据:
POST /api/data/example
Authorization: Bearer YOUR_API_KEY
{"name": "example", "value": "data"}`}
						</pre>
					</div>
				</div>
			</div>
		</div>
	);
};

export default AdminConsolePage;
