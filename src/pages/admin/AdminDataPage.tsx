import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Container, Content, Button, Input, Table, Pagination } from 'rsuite';
import { Search, Edit, Trash2, FileText, Paperclip } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { StorageData } from '../../types';
import '../../styles/WebUIConsole.less';

const { Column, HeaderCell, Cell } = Table;

interface AdminContext {
	onOpenCreateModal: () => void;
	onOpenEditModal: (data: StorageData) => void;
}

const AdminDataPage: React.FC = () => {
	const { onOpenEditModal } = useOutletContext<AdminContext>();
	const { listData, deleteData } = useApi();

	const [dataList, setDataList] = useState<StorageData[]>([]);
	const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
	const [searchQuery, setSearchQuery] = useState('');
	const [sortBy, setSortBy] = useState('updatedAt');
	const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
	const [loading, setLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	const loadData = useCallback(async () => {
		if (abortRef.current) {
			abortRef.current.abort();
		}
		abortRef.current = new AbortController();
		setLoading(true);

		try {
			const response = await listData(pagination.page, pagination.limit, searchQuery || undefined, sortBy, sortOrder);
			if (response.success && response.data) {
				setDataList(response.data.items || []);
				setPagination((prev) => ({
					...prev,
					total: response.data?.total || 0,
				}));
			}
		} catch (err) {
			if ((err as Error).name !== 'AbortError') {
				console.error('加载数据失败:', err);
			}
		} finally {
			setLoading(false);
			abortRef.current = null;
		}
	}, [listData, pagination.page, pagination.limit, searchQuery, sortBy, sortOrder]);

	useEffect(() => {
		loadData();
		return () => {
			if (abortRef.current) {
				abortRef.current.abort();
			}
		};
	}, [loadData]);

	const handleSearch = () => {
		setPagination((prev) => ({ ...prev, page: 1 }));
	};

	const handleSort = (field: string) => {
		if (sortBy === field) {
			setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
		} else {
			setSortBy(field);
			setSortOrder('desc');
		}
		setPagination((prev) => ({ ...prev, page: 1 }));
	};

	const handleDeleteData = async (id: string) => {
		const confirmed = window.confirm(`确定要删除 "${id}" 吗？此操作不可撤销。`);
		if (!confirmed) return;

		setLoading(true);
		try {
			const response = await deleteData(id);
			if (response.success) {
				alert('数据删除成功！');
				await loadData();
			} else {
				alert(`删除失败: ${response.error}`);
			}
		} catch {
			alert('删除失败');
		} finally {
			setLoading(false);
		}
	};

	const getTypeIcon = (type?: string) => {
		switch (type) {
			case 'json':
			case 'text':
				return <FileText size={16} />;
			case 'binary':
				return <Paperclip size={16} />;
			default:
				return <Paperclip size={16} />;
		}
	};

	const formatSize = (bytes?: number) => {
		if (!bytes) return '0 B';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	};

	const formatDate = (dateString?: string) => {
		if (!dateString) return '-';
		try {
			return new Date(dateString).toLocaleString();
		} catch {
			return '-';
		}
	};

	return (
		<div className="admin-data-page">
			<div className="data-controls">
				<div className="data-header">
					<h4 className="section-title">
						<span>数据管理</span>
					</h4>
				</div>

				<div className="data-controls-row">
					<Input
						className="data-controls-row-search"
						placeholder="搜索数据..."
						value={searchQuery}
						onChange={setSearchQuery}
					/>
					<Button onClick={handleSearch} className="btn-search">
						<Search size={16} /> 搜索
					</Button>
				</div>

				<div className="data-controls-row-sort">
					<span>排序：</span>
					<Button
						size="sm"
						appearance={sortBy === 'updatedAt' ? 'primary' : 'subtle'}
						onClick={() => handleSort('updatedAt')}
					>
						<span className="sort-btn-content">
							更新时间 {sortBy === 'updatedAt' && (sortOrder === 'asc' ? '↑' : '↓')}
						</span>
					</Button>
					<Button size="sm" appearance={sortBy === 'id' ? 'primary' : 'subtle'} onClick={() => handleSort('id')}>
						<span className="sort-btn-content">
							路径 {sortBy === 'id' && (sortOrder === 'asc' ? '↑' : '↓')}
						</span>
					</Button>
					<Button size="sm" appearance={sortBy === 'size' ? 'primary' : 'subtle'} onClick={() => handleSort('size')}>
						<span className="sort-btn-content">
							大小 {sortBy === 'size' && (sortOrder === 'asc' ? '↑' : '↓')}
						</span>
					</Button>
				</div>
			</div>

			<div className="data-table-container">
				<Table height={400} data={dataList} loading={loading} autoHeight wordWrap="break-all" rowKey="id">
					<Column width={50} fixed>
						<HeaderCell>类型</HeaderCell>
						<Cell>{(rowData) => <span className="table-type-icon">{getTypeIcon(rowData.type)}</span>}</Cell>
					</Column>

					<Column flexGrow={1} fullText>
						<HeaderCell>路径</HeaderCell>
						<Cell dataKey="id" />
					</Column>

					<Column width={100}>
						<HeaderCell>类型</HeaderCell>
						<Cell>
							{(rowData) => (
								<span className={`type-badge type-badge-${rowData.type || 'unknown'}`}>
									{(rowData.type || 'UNKNOWN').toUpperCase()}
								</span>
							)}
						</Cell>
					</Column>

					<Column width={100}>
						<HeaderCell>大小</HeaderCell>
						<Cell>{(rowData) => formatSize(rowData.size)}</Cell>
					</Column>

					<Column width={150}>
						<HeaderCell>更新时间</HeaderCell>
						<Cell>{(rowData) => formatDate(rowData.updatedAt)}</Cell>
					</Column>

					<Column width={120} fixed="right">
						<HeaderCell>操作</HeaderCell>
						<Cell>
							{(rowData: StorageData) => (
								<ButtonToolbar>
									<Button size="sm" onClick={() => onOpenEditModal(rowData)}>
										<Edit size={14} />
									</Button>
									<Button size="sm" color="red" onClick={() => handleDeleteData(rowData.id)}>
										<Trash2 size={14} />
									</Button>
								</ButtonToolbar>
							)}
						</Cell>
					</Column>
				</Table>
			</div>

			<div className="data-pagination">
				<span>
					共 {pagination.total} 条数据，第 {pagination.page} 页
				</span>
				<Pagination
					total={pagination.total}
					limit={pagination.limit}
					activePage={pagination.page}
					onChangePage={(page) => {
						setPagination((prev) => ({ ...prev, page }));
					}}
				/>
			</div>
		</div>
	);
};

const ButtonToolbar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<div style={{ display: 'flex', gap: '4px' }}>{children}</div>
);

export default AdminDataPage;
