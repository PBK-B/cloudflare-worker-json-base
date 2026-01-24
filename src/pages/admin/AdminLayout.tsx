import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Container, Header, Content, Button } from 'rsuite';
import { Settings, Database, RefreshCw, LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApi } from '../../hooks/useApi';
import { ModalForm } from '../../components/common/ModalForm';
import { StorageData } from '../../types';
import '../../styles/WebUIConsole.less';

interface FormData {
	path: string;
	value: string;
	type: 'json' | 'text' | 'binary';
}

const AdminLayout: React.FC = () => {
	const { logout } = useAuth();
	const navigate = useNavigate();
	const { createData, updateData } = useApi();

	const [showCreateModal, setShowCreateModal] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [selectedData, setSelectedData] = useState<StorageData | null>(null);

	const handleLogout = () => {
		logout();
		navigate('/login');
	};

	const handleOpenCreateModal = () => {
		setShowCreateModal(true);
	};

	const handleOpenEditModal = (data: StorageData) => {
		setSelectedData(data);
		setShowEditModal(true);
	};

	const handleCloseModals = () => {
		setShowCreateModal(false);
		setShowEditModal(false);
		setSelectedData(null);
	};

	const handleCreateSubmit = async (data: FormData) => {
		let processedValue = data.value;
		if (data.type === 'json') {
			processedValue = JSON.parse(data.value);
		}

		const response = await createData(data.path, {
			value: processedValue,
			type: data.type,
		});

		if (response.success) {
			handleCloseModals();
			await new Promise(resolve => setTimeout(resolve, 100));
			window.location.reload();
		} else {
			alert(`创建失败: ${response.error}`);
		}
	};

	const handleEditSubmit = async (data: FormData) => {
		if (!selectedData) return;

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
			await new Promise(resolve => setTimeout(resolve, 100));
			window.location.reload();
		} else {
			alert(`更新失败: ${response.error}`);
		}
	};

	return (
		<Container className="admin-layout">
			<Header className="admin-header">
				<div className="admin-header-content">
					<div className="admin-logo">
						<LayoutDashboard size={24} />
						<span>JSON Base 管理控制台</span>
					</div>
					<div className="admin-nav">
						<NavLink
							to="/admin"
							end
							className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
						>
							<Settings size={16} />
							控制台
						</NavLink>
						<NavLink
							to="/admin/data"
							className={({ isActive }) => `admin-nav-link ${isActive ? 'active' : ''}`}
						>
							<Database size={16} />
							数据管理
						</NavLink>
					</div>
					<div className="admin-actions">
						<Button appearance="subtle" onClick={() => window.location.reload()}>
							<RefreshCw size={16} />
						</Button>
						<Button appearance="subtle" onClick={handleLogout} className="admin-logout-btn">
							<LogOut size={16} />
							退出
						</Button>
					</div>
				</div>
			</Header>
			<Content className="admin-content">
				<Outlet context={{ onOpenCreateModal: handleOpenCreateModal, onOpenEditModal: handleOpenEditModal }} />
			</Content>

			<ModalForm
				show={showCreateModal}
				onClose={handleCloseModals}
				onSubmit={handleCreateSubmit}
				title="创建数据"
				loading={false}
				mode="create"
			/>

			{selectedData && (
				<ModalForm
					show={showEditModal}
					onClose={handleCloseModals}
					onSubmit={handleEditSubmit}
					title="编辑数据"
					initialData={{
						path: selectedData.id,
						value: typeof selectedData.value === 'string' ? selectedData.value : JSON.stringify(selectedData.value),
						type: selectedData.type,
					}}
					loading={false}
					mode="edit"
				/>
			)}
		</Container>
	);
};

export default AdminLayout;
