import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Container, Content, Button, Input, Table, Pagination, Modal } from 'rsuite';
import { Search, Edit, Trash2, FileText, Paperclip, Plus, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../hooks/useApi';
import { StorageData } from '../../types';
import '../../styles/WebUIConsole.less';

const { Column, HeaderCell, Cell } = Table;

interface AdminContext {
	onOpenCreateModal: (defaultType?: 'json' | 'text' | 'binary') => void;
	onOpenEditModal: (data: StorageData) => void;
	refreshKey?: number;
}

const AdminDataPage: React.FC = () => {
	const { onOpenCreateModal, onOpenEditModal, refreshKey } = useOutletContext<AdminContext>();
	const { listData, deleteData } = useApi();
	const { t } = useTranslation();

	const [dataList, setDataList] = useState<StorageData[]>([]);
	const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0 });
	const [searchQuery, setSearchQuery] = useState('');
	const [sortBy, setSortBy] = useState('updated_at');
	const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
	const [loading, setLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const [deleteModalOpen, setDeleteModalOpen] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [errorModalOpen, setErrorModalOpen] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');

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
				console.error(t('api.listFailed', { defaultValue: "获取列表失败" }), err);
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
	}, [loadData, refreshKey]);

	useEffect(() => {
		const handleStorageChange = (e: StorageEvent) => {
			if (e.key === 'jsonbase-data-refresh') {
				loadData();
			}
		};
		window.addEventListener('storage', handleStorageChange);
		return () => window.removeEventListener('storage', handleStorageChange);
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

	const handleDeleteData = (id: string) => {
		setDeletingId(id);
		setDeleteModalOpen(true);
	};

	const confirmDelete = async () => {
		if (!deletingId) return;

		setLoading(true);
		try {
			const response = await deleteData(deletingId);
			if (response.success) {
				setDeleteModalOpen(false);
				setDeletingId(null);
				await loadData();
			} else {
				setErrorMessage(response.error || t('data.delete.failed', { defaultValue: "删除数据时发生错误" }));
				setErrorModalOpen(true);
			}
		} catch {
			setErrorMessage(t('data.delete.failed', { defaultValue: "删除数据时发生错误" }));
			setErrorModalOpen(true);
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
						<span>{t('data.title', { defaultValue: "数据管理" })}</span>
					</h4>
				</div>

				<div className="data-controls-row">
					<Input className="data-controls-row-search" placeholder={t('data.searchPlaceholder', { defaultValue: "搜索数据..." })} value={searchQuery} onChange={setSearchQuery} />
					<Button onClick={handleSearch} className="btn-search">
						<Search size={16} /> {t('data.search', { defaultValue: "搜索" })}
					</Button>
				</div>

				<div className="data-controls-row-sort">
					<Button className="create-btn" size="sm" appearance="primary" onClick={() => onOpenCreateModal()}>
						<Plus size={14} /> {t('data.create', { defaultValue: "创建数据" })}
					</Button>
					<span style={{ marginLeft: 'auto' }}>{t('data.sort', { defaultValue: "排序：" })}</span>
					<Button size="sm" appearance={sortBy === 'updated_at' ? 'primary' : 'subtle'} onClick={() => handleSort('updated_at')}>
						<span className="sort-btn-content">{t('data.sortUpdatedAt', { defaultValue: "更新时间" })} {sortBy === 'updated_at' && (sortOrder === 'asc' ? '↑' : '↓')}</span>
					</Button>
					<Button size="sm" appearance={sortBy === 'id' ? 'primary' : 'subtle'} onClick={() => handleSort('id')}>
						<span className="sort-btn-content">{t('data.sortPath', { defaultValue: "路径" })} {sortBy === 'id' && (sortOrder === 'asc' ? '↑' : '↓')}</span>
					</Button>
					<Button size="sm" appearance={sortBy === 'size' ? 'primary' : 'subtle'} onClick={() => handleSort('size')}>
						<span className="sort-btn-content">{t('data.sortSize', { defaultValue: "大小" })} {sortBy === 'size' && (sortOrder === 'asc' ? '↑' : '↓')}</span>
					</Button>
				</div>
			</div>

			<div className="data-table-container">
				<Table height={400} data={dataList} loading={loading} autoHeight wordWrap="break-all" rowKey="id">
					<Column width={50} fixed>
						<HeaderCell>{t('data.table.icon', { defaultValue: "类型" })}</HeaderCell>
						<Cell>{(rowData) => <span className="table-type-icon">{getTypeIcon(rowData.type)}</span>}</Cell>
					</Column>

					<Column flexGrow={1} fullText>
						<HeaderCell>{t('data.table.path', { defaultValue: "路径" })}</HeaderCell>
						<Cell dataKey="id" />
					</Column>

					<Column width={100}>
						<HeaderCell>{t('data.table.type', { defaultValue: "类型" })}</HeaderCell>
						<Cell>
							{(rowData) => (
								<span className={`type-badge type-badge-${rowData.type || 'unknown'}`}>{(rowData.type || 'UNKNOWN').toUpperCase()}</span>
							)}
						</Cell>
					</Column>

					<Column width={100}>
						<HeaderCell>{t('data.table.size', { defaultValue: "大小" })}</HeaderCell>
						<Cell>{(rowData) => formatSize(rowData.size)}</Cell>
					</Column>

					<Column width={152}>
						<HeaderCell>{t('data.table.updatedAt', { defaultValue: "更新时间" })}</HeaderCell>
						<Cell>{(rowData) => formatDate(rowData.updated_at)}</Cell>
					</Column>

					<Column width={120} fixed="right">
						<HeaderCell>{t('data.table.actions', { defaultValue: "操作" })}</HeaderCell>
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
				<span>{t('data.pagination', { defaultValue: "共 {{total}} 条数据，第 {{page}} 页", total: pagination.total, page: pagination.page })}</span>
				<Pagination
					total={pagination.total}
					limit={pagination.limit}
					activePage={pagination.page}
					onChangePage={(page) => {
						setPagination((prev) => ({ ...prev, page }));
					}}
				/>
			</div>

			<Modal open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)}>
				<Modal.Header>
					<Modal.Title style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
						<AlertTriangle size={18} style={{ color: '#ff4d4f' }} />
						{t('data.delete.confirmTitle', { defaultValue: "确认删除" })}
					</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<p>{t('data.delete.confirmText', { defaultValue: "确定要删除 \"{{id}}\" 吗？", id: deletingId })}</p>
					<p style={{ color: '#999', marginTop: '8px', fontSize: '12px' }}>{t('data.delete.confirmHint', { defaultValue: "此操作不可撤销，数据将被永久删除。" })}</p>
				</Modal.Body>
				<Modal.Footer>
					<Button onClick={() => setDeleteModalOpen(false)} appearance="subtle">
						{t('data.delete.cancel', { defaultValue: "取消" })}
					</Button>
					<Button onClick={confirmDelete} appearance="primary" color="red" loading={loading}>
						{t('data.delete.submit', { defaultValue: "删除" })}
					</Button>
				</Modal.Footer>
			</Modal>

			<Modal open={errorModalOpen} onClose={() => setErrorModalOpen(false)}>
				<Modal.Header>
					<Modal.Title style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
						<AlertTriangle size={18} style={{ color: '#ff4d4f' }} />
						{t('data.delete.failedTitle', { defaultValue: "删除失败" })}
					</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<p>{errorMessage}</p>
				</Modal.Body>
				<Modal.Footer>
					<Button onClick={() => setErrorModalOpen(false)} appearance="primary">
						{t('data.delete.confirm', { defaultValue: "确定" })}
					</Button>
				</Modal.Footer>
			</Modal>
		</div>
	);
};

const ButtonToolbar: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<div style={{ display: 'flex', gap: '4px' }}>{children}</div>
);

export default AdminDataPage;
