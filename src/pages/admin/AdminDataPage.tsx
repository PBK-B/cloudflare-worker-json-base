import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button, Input, Table, Pagination, Modal } from 'rsuite';
import { Search, Edit, Trash2, FileText, Paperclip, Plus, AlertTriangle, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../hooks/useApi';
import { StorageData } from '../../types';
import styles from './AdminDataPage.module.scss';

const { Column, HeaderCell, Cell } = Table;

interface AdminContext {
	onOpenCreateModal: (defaultType?: 'json' | 'text' | 'binary') => void;
	onOpenEditModal: (data: StorageData) => void;
	refreshKey?: number;
}

interface ContextMenuState {
	data: StorageData;
	x: number;
	y: number;
	adjustedX?: number;
	adjustedY?: number;
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
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);

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

	useEffect(() => {
		if (!contextMenu) {
			return;
		}

		if (menuRef.current) {
			const menuRect = menuRef.current.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const edgePadding = 12;
			const nextX = Math.max(edgePadding, Math.min(contextMenu.x, viewportWidth - menuRect.width - edgePadding));
			const nextY = Math.max(edgePadding, Math.min(contextMenu.y, viewportHeight - menuRect.height - edgePadding));

			if (nextX !== contextMenu.adjustedX || nextY !== contextMenu.adjustedY) {
				setContextMenu((prev) => {
					if (!prev) {
						return prev;
					}

					if (prev.adjustedX === nextX && prev.adjustedY === nextY) {
						return prev;
					}

					return {
						...prev,
						adjustedX: nextX,
						adjustedY: nextY,
					};
				});
			}
		}

		const closeMenu = () => setContextMenu(null);
		const handlePointerDown = (event: MouseEvent) => {
			if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) {
				return;
			}
			closeMenu();
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				closeMenu();
			}
		};

		window.addEventListener('mousedown', handlePointerDown);
		window.addEventListener('scroll', closeMenu, true);
		window.addEventListener('resize', closeMenu);
		window.addEventListener('keydown', handleEscape);

		return () => {
			window.removeEventListener('mousedown', handlePointerDown);
			window.removeEventListener('scroll', closeMenu, true);
			window.removeEventListener('resize', closeMenu);
			window.removeEventListener('keydown', handleEscape);
		};
	}, [contextMenu]);

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

	const renderSortHeader = (field: string, label: string) => {
		const isActive = sortBy === field;
		const SortIcon = isActive && sortOrder === 'asc' ? ArrowUp : ArrowDown;

		return (
			<button
				type="button"
				className={`${styles.tableSortTrigger} ${isActive ? styles.tableSortActive : ''}`}
				onClick={() => handleSort(field)}
			>
				<span>{label}</span>
				<SortIcon size={14} className={styles.tableSortIcon} />
			</button>
		);
	};

	const getTypeBadgeClassName = (type?: string) => {
		switch (type) {
			case 'json':
				return `${styles.typeBadge} ${styles.typeBadgeJson}`;
			case 'text':
				return `${styles.typeBadge} ${styles.typeBadgeText}`;
			case 'binary':
				return `${styles.typeBadge} ${styles.typeBadgeBinary}`;
			default:
				return styles.typeBadge;
		}
	};

	const getResourceUrl = useCallback((id: string) => {
		const apiKey = localStorage.getItem('jsonbase-api-key');
		const url = new URL(id, window.location.origin);

		if (apiKey) {
			url.searchParams.set('key', apiKey);
		}

		return url.toString();
	}, []);

	const handleOpenInNewTab = useCallback((rowData: StorageData) => {
		window.open(getResourceUrl(rowData.id), '_blank', 'noopener,noreferrer');
		setContextMenu(null);
	}, [getResourceUrl]);

	const handlePathContextMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>, rowData: StorageData) => {
		event.preventDefault();
		setContextMenu({
			data: rowData,
			x: event.clientX,
			y: event.clientY,
		});
	}, []);

	return (
		<div className={styles.adminDataPage}>
			<div className={styles.dataControls}>
				<div className={styles.dataHeader}>
					<h4 className={styles.sectionTitle}>
						<span>{t('data.title', { defaultValue: "数据管理" })}</span>
					</h4>
				</div>

				<div className={styles.controlsRow}>
					<Input className={styles.searchInput} placeholder={t('data.searchPlaceholder', { defaultValue: "搜索数据..." })} value={searchQuery} onChange={setSearchQuery} />
					<Button onClick={handleSearch} className={styles.searchButton}>
						<Search size={16} /> {t('data.search', { defaultValue: "搜索" })}
					</Button>
				</div>

				<div className={styles.sortRow}>
					<Button className={styles.createButton} size="sm" appearance="primary" onClick={() => onOpenCreateModal()}>
						<Plus size={14} /> {t('data.create', { defaultValue: "创建数据" })}
					</Button>
				</div>
			</div>

			<div className={styles.tableContainer}>
				<Table height={400} data={dataList} loading={loading} autoHeight wordWrap="break-all" rowKey="id">
					<Column width={50} fixed>
						<HeaderCell>{t('data.table.icon', { defaultValue: "类型" })}</HeaderCell>
						<Cell>{(rowData) => <span className={styles.tableTypeIcon}>{getTypeIcon(rowData.type)}</span>}</Cell>
					</Column>

					<Column flexGrow={1} fullText>
						<HeaderCell>{renderSortHeader('id', t('data.table.path', { defaultValue: "路径" }))}</HeaderCell>
						<Cell>
							{(rowData: StorageData) => (
								<button
									type="button"
									className={styles.pathCellButton}
									onContextMenu={(event) => handlePathContextMenu(event, rowData)}
									title={t('data.table.pathContextHint', { defaultValue: "右键打开菜单" })}
								>
									{rowData.id}
								</button>
							)}
						</Cell>
					</Column>

					<Column width={100}>
						<HeaderCell>{t('data.table.type', { defaultValue: "类型" })}</HeaderCell>
						<Cell>
							{(rowData) => (
								<span className={getTypeBadgeClassName(rowData.type)}>{(rowData.type || 'UNKNOWN').toUpperCase()}</span>
							)}
						</Cell>
					</Column>

					<Column width={100}>
						<HeaderCell>{renderSortHeader('size', t('data.table.size', { defaultValue: "大小" }))}</HeaderCell>
						<Cell>{(rowData) => formatSize(rowData.size)}</Cell>
					</Column>

					<Column width={152}>
						<HeaderCell>{renderSortHeader('updated_at', t('data.table.updatedAt', { defaultValue: "更新时间" }))}</HeaderCell>
						<Cell>{(rowData) => formatDate(rowData.updated_at)}</Cell>
					</Column>

					<Column width={120} fixed="right">
						<HeaderCell>{t('data.table.actions', { defaultValue: "操作" })}</HeaderCell>
						<Cell>
							{(rowData: StorageData) => (
								<ButtonToolbar>
									<Button size="sm" onClick={() => onOpenEditModal(rowData)} title={rowData.type === 'binary' ? t('data.replaceFile', { defaultValue: "替换文件" }) : t('data.edit', { defaultValue: "编辑" })}>
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

			{contextMenu ? (
				<div
					ref={menuRef}
					className={styles.contextMenu}
					style={{ left: contextMenu.adjustedX ?? contextMenu.x, top: contextMenu.adjustedY ?? contextMenu.y }}
					role="menu"
				>
					<button
						type="button"
						className={styles.contextMenuAction}
						onClick={() => handleOpenInNewTab(contextMenu.data)}
					>
						<ExternalLink size={14} />
						<span>
							{contextMenu.data.type === 'binary'
								? t('data.contextMenu.openFileInNewTab', { defaultValue: "新标签页打开文件" })
								: t('data.contextMenu.openDataInNewTab', { defaultValue: "新标签页打开数据" })}
						</span>
					</button>
				</div>
			) : null}

			<div className={styles.pagination}>
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
					<Modal.Title className={styles.modalTitle}>
						<AlertTriangle size={18} className={styles.modalAlertIcon} />
						{t('data.delete.confirmTitle', { defaultValue: "确认删除" })}
					</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<p>{t('data.delete.confirmText', { defaultValue: "确定要删除 \"{{id}}\" 吗？", id: deletingId })}</p>
					<p className={styles.deleteHint}>{t('data.delete.confirmHint', { defaultValue: "此操作不可撤销，数据将被永久删除。" })}</p>
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
					<Modal.Title className={styles.modalTitle}>
						<AlertTriangle size={18} className={styles.modalAlertIcon} />
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
	<div className={styles.buttonToolbar}>{children}</div>
);

export default AdminDataPage;
