import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Container, Header, Content, Button, Form, Input } from 'rsuite';
import { Key, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import '../styles/WebUIConsole.less';

const LoginPage: React.FC = () => {
	const [apiKey, setApiKey] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const { login, isAuthenticated, isLoading } = useAuth();
	const navigate = useNavigate();

	if (isLoading) {
		return (
			<Container className="login-container">
				<div className="login-loading">
					<div className="login-spinner"></div>
					<p>加载中...</p>
				</div>
			</Container>
		);
	}

	if (isAuthenticated) {
		return <Navigate to="/admin" replace />;
	}

	const handleSubmit = async () => {
		if (!apiKey.trim()) {
			setError('请输入 API Key');
			return;
		}

		setLoading(true);
		setError('');

		const success = await login(apiKey);

		if (success) {
			navigate('/admin');
		} else {
			setError('API Key 无效，请检查后重试');
		}

		setLoading(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	return (
		<Container className="login-container">
			<div className="login-background">
				<div className="login-particles"></div>
			</div>

			<div className="login-card">
				<div className="login-header">
					<div className="login-icon">
						<Key size={32} />
					</div>
					<h1 className="login-title">JSON Base</h1>
					<p className="login-subtitle">Cloudflare Workers JSON 存储服务</p>
				</div>

				<Form fluid onSubmit={handleSubmit}>
					<Form.Group>
						<Form.ControlLabel>API Key</Form.ControlLabel>
						<div className="login-input-wrapper">
							<Lock size={16} className="login-input-icon" />
							<Input
								type="password"
								value={apiKey}
								onChange={(value) => {
									setApiKey(value);
									setError('');
								}}
								onKeyDown={handleKeyDown}
								placeholder="请输入您的 API Key"
								size="lg"
								disabled={loading}
								className="login-input"
							/>
						</div>
					</Form.Group>

					{error && <div className="login-error">{error}</div>}

					<Form.Group>
						<Button
							appearance="primary"
							onClick={handleSubmit}
							loading={loading}
							size="lg"
							block
							className="login-btn"
						>
							<span className="login-btn-content">
								验证并登录
								<ArrowRight size={18} />
							</span>
						</Button>
					</Form.Group>
				</Form>

				<div className="login-footer">
					<p>输入 API Key 以访问管理控制台</p>
				</div>
			</div>
		</Container>
	);
};

export default LoginPage;
