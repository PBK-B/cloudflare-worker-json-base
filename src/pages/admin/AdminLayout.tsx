import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Container, Header, Content, Button, Dropdown } from 'rsuite';
import { Settings, Database, RefreshCw, LogOut, LayoutDashboard, Menu, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { ModalForm } from '../../components/common/ModalForm';
import { StorageData } from '../../types';
import { notify } from '../../utils/notification';
import { appRoutes } from '../../router/routes';
import styles from './AdminLayout.module.scss';

interface FormData {
	path: string;
	value: string;
	type: 'json' | 'text' | 'binary';
}

const DATA_REFRESH_EVENT = 'jsonbase-data-refresh';

const AdminLayout: React.FC = () => {
	const { logout } = useAuth();
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const { createData, uploadFile, replaceFile, updateData } = useApi();

	const [showCreateModal, setShowCreateModal] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [selectedData, setSelectedData] = useState<StorageData | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);
	const [createDefaultType, setCreateDefaultType] = useState<'json' | 'text' | 'binary'>('json');
	const [submitLoading, setSubmitLoading] = useState(false);
	const [mobileNavOpen, setMobileNavOpen] = useState(false);
	const submitAbortRef = useRef<AbortController | null>(null);
	const currentLanguage = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'zh';

	const handleLanguageChange = useCallback((language: 'zh' | 'en') => {
		if (language !== currentLanguage) {
			void i18n.changeLanguage(language);
		}
	}, [currentLanguage, i18n]);

	const handleLogout = () => {
		setMobileNavOpen(false);
		logout();
		navigate(appRoutes.login);
	};

	useEffect(() => {
		setMobileNavOpen(false);
	}, [location.pathname]);

	const handleOpenCreateModal = (defaultType?: 'json' | 'text' | 'binary') => {
		setCreateDefaultType(defaultType || 'json');
		setShowCreateModal(true);
	};

	const handleOpenEditModal = (data: StorageData) => {
		setSelectedData(data);
		setShowEditModal(true);
	};

	const handleCloseModals = () => {
		if (submitAbortRef.current) {
			submitAbortRef.current.abort();
			submitAbortRef.current = null;
		}

		setShowCreateModal(false);
		setShowEditModal(false);
		setSelectedData(null);
	};

	const notifyRefresh = () => {
		setRefreshKey(prev => prev + 1);
		localStorage.setItem(DATA_REFRESH_EVENT, Date.now().toString());
	};

	const handleCreateSubmit = async (data: FormData, file?: File) => {
		const controller = new AbortController();
		submitAbortRef.current = controller;
		setSubmitLoading(true);
		try {
			if (file) {
				const response = await uploadFile(data.path, file, file.type, controller.signal);
				if (response.success) {
					submitAbortRef.current = null;
					handleCloseModals();
					notify.success(t('layout.createSuccess', { defaultValue: "创建成功" }));
					notifyRefresh();
				} else {
					notify.error(`${t('layout.createFailed', { defaultValue: "创建失败" })}: ${response.error}`);
				}
			} else {
				let processedValue = data.value;
				if (data.type === 'json') {
					processedValue = JSON.parse(data.value);
				}

				const response = await createData(data.path, {
					value: processedValue,
					type: data.type,
				}, controller.signal);

				if (response.success) {
					submitAbortRef.current = null;
					handleCloseModals();
					notify.success(t('layout.createSuccess', { defaultValue: "创建成功" }));
					notifyRefresh();
				} else {
					notify.error(`${t('layout.createFailed', { defaultValue: "创建失败" })}: ${response.error}`);
				}
			}
		} catch (error) {
			if (axios.isCancel(error) || (axios.isAxiosError(error) && error.code === 'ERR_CANCELED')) {
				return;
			}

			notify.error(t('layout.createFailed', { defaultValue: "创建失败" }));
			console.error('Create error:', error);
		} finally {
			if (submitAbortRef.current === controller) {
				submitAbortRef.current = null;
			}
			setSubmitLoading(false);
		}
	};

	const handleEditSubmit = async (data: FormData, file?: File) => {
		setSubmitLoading(true);
		try {
			if (!selectedData) return;

			if (selectedData.type === 'binary') {
				if (!file) {
					notify.error(t('layout.binaryReplaceOnly', { defaultValue: "请重新上传文件以替换当前资源" }));
					return;
				}

				const response = await replaceFile(selectedData.id, file);
				if (response.success) {
					handleCloseModals();
					notify.success(t('layout.updateSuccess', { defaultValue: "更新成功" }));
					notifyRefresh();
				} else {
					notify.error(`${t('layout.updateFailed', { defaultValue: "更新失败" })}: ${response.error}`);
				}
				return;
			}

			let processedValue = data.value;
			if (data.type === 'json') {
				processedValue = JSON.parse(data.value);
			}

			const response = await updateData(selectedData.id, {
				value: processedValue,
				type: data.type,
			});

			if (response.success) {
				handleCloseModals();
				notify.success(t('layout.updateSuccess', { defaultValue: "更新成功" }));
				notifyRefresh();
			} else {
				notify.error(`${t('layout.updateFailed', { defaultValue: "更新失败" })}: ${response.error}`);
			}
		} catch (error) {
			notify.error(t('layout.updateFailed', { defaultValue: "更新失败" }));
			console.error('Update error:', error);
		} finally {
			setSubmitLoading(false);
		}
	};

	return (
		<Container className={styles.adminLayout}>
			<Header className={styles.adminHeader}>
				<div className={styles.adminHeaderContent}>
					<div className={styles.adminLogo}>
						<LayoutDashboard size={24} />
						<span>{t('layout.consoleTitle', { defaultValue: "JSON Base 管理控制台" })}</span>
					</div>
					<div className={`${styles.adminNav} ${styles.adminNavDesktop}`}>
						<NavLink
							to={appRoutes.admin}
							end
							className={({ isActive }) => `${styles.adminNavLink} ${isActive ? styles.navLinkActive : ''}`}
						>
							<Settings size={16} />
							{t('layout.navConsole', { defaultValue: "控制台" })}
						</NavLink>
						<NavLink
							to={appRoutes.adminData}
							className={({ isActive }) => `${styles.adminNavLink} ${isActive ? styles.navLinkActive : ''}`}
						>
							<Database size={16} />
							{t('layout.navData', { defaultValue: "数据管理" })}
						</NavLink>
					</div>
					<div className={styles.adminActions}>
						<Button
							appearance="subtle"
							onClick={() => setMobileNavOpen(prev => !prev)}
							className={styles.adminMenuToggle}
							aria-label={t('layout.openMenu', { defaultValue: "打开菜单" })}
							aria-expanded={mobileNavOpen}
						>
							<Menu size={18} />
						</Button>
						<Button
							appearance="subtle"
							onClick={() => window.location.reload()}
							className={styles.adminRefreshButton}
							aria-label={t('layout.refresh', { defaultValue: "刷新" })}
						>
							<RefreshCw size={16} />
						</Button>
						<Dropdown
							placement="bottomEnd"
							trigger="click"
							className={styles.languageMenu}
							renderToggle={(props, ref) => (
								<Button
									{...props}
									ref={ref}
									appearance="subtle"
									className={styles.languageToggle}
									aria-label={t('layout.languageMenu', { defaultValue: '切换语言' })}
								>
									<Languages size={16} />
									<span className={styles.languageToggleText}>
										{t(`layout.languages.${currentLanguage}`, { defaultValue: currentLanguage === 'en' ? 'English' : '中文' })}
									</span>
								</Button>
							)}
						>
							<Dropdown.Item
								active={currentLanguage === 'zh'}
								className={currentLanguage === 'zh' ? styles.languageMenuItemActive : ''}
								onClick={() => handleLanguageChange('zh')}
							>
								{t('layout.languages.zh', { defaultValue: '中文' })}
							</Dropdown.Item>
							<Dropdown.Item
								active={currentLanguage === 'en'}
								className={currentLanguage === 'en' ? styles.languageMenuItemActive : ''}
								onClick={() => handleLanguageChange('en')}
							>
								{t('layout.languages.en', { defaultValue: 'English' })}
							</Dropdown.Item>
						</Dropdown>
						<Button
							appearance="subtle"
							onClick={handleLogout}
							className={styles.adminLogoutButton}
							aria-label={t('layout.logout', { defaultValue: "退出" })}
						>
							<LogOut size={16} />
							<span className={styles.adminLogoutText}>{t('layout.logout', { defaultValue: "退出" })}</span>
						</Button>
					</div>
				</div>

				{mobileNavOpen && (
					<div className={styles.adminMobileNavShell}>
						<div className={styles.adminMobileNavPanel}>
							<div className={`${styles.adminNav} ${styles.adminNavMobile}`}>
								<NavLink
									to={appRoutes.admin}
									end
									className={({ isActive }) => `${styles.adminNavLink} ${styles.adminNavLinkMobile} ${isActive ? styles.navLinkActive : ''}`}
								>
									<Settings size={16} />
									{t('layout.navConsole', { defaultValue: "控制台" })}
								</NavLink>
								<NavLink
									to={appRoutes.adminData}
									className={({ isActive }) => `${styles.adminNavLink} ${styles.adminNavLinkMobile} ${isActive ? styles.navLinkActive : ''}`}
								>
									<Database size={16} />
									{t('layout.navData', { defaultValue: "数据管理" })}
								</NavLink>
							</div>
						</div>
					</div>
				)}
			</Header>

			<Content className={styles.adminContent}>
				<Outlet context={{ onOpenCreateModal: handleOpenCreateModal, onOpenEditModal: handleOpenEditModal, refreshKey }} />
			</Content>

			<ModalForm
				show={showCreateModal}
				onClose={handleCloseModals}
				onSubmit={handleCreateSubmit}
				title={t('layout.createData', { defaultValue: "创建数据" })}
				loading={submitLoading}
				mode="create"
				initialType={createDefaultType}
				backdrop="static"
				keyboard={false}
			/>

			{selectedData && (
				<ModalForm
					show={showEditModal}
					onClose={handleCloseModals}
					onSubmit={handleEditSubmit}
					title={t('layout.editData', { defaultValue: "编辑数据" })}
					loading={submitLoading}
					initialData={{
						path: selectedData.id,
						value: typeof selectedData.value === 'string' ? selectedData.value : JSON.stringify(selectedData.value),
						type: selectedData.type,
					}}
					allowBinaryEdit
					mode="edit"
				/>
			)}
		</Container>
	);
};

export default AdminLayout;
