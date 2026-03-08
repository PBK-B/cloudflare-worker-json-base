import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Container, Header, Content, Button, Form, Input } from 'rsuite';
import { Key, Lock, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { appRoutes } from '../router/routes';
import styles from './LoginPage.module.scss';

const LoginPage: React.FC = () => {
	const [apiKey, setApiKey] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const { login, isAuthenticated, isLoading } = useAuth();
	const { t } = useTranslation();
	const navigate = useNavigate();

	if (isLoading) {
		return (
			<Container className={styles.loginContainer}>
				<div className={styles.loginLoading}>
					<div className={styles.loginSpinner}></div>
					<p>{t('login.loading', { defaultValue: "加载中..." })}</p>
				</div>
			</Container>
		);
	}

	if (isAuthenticated) {
		return <Navigate to={appRoutes.admin} replace />;
	}

	const handleSubmit = async () => {
		if (!apiKey.trim()) {
			setError(t('login.apiKeyRequired', { defaultValue: "请输入 API Key" }));
			return;
		}

		setLoading(true);
		setError('');

		const result = await login(apiKey);

		if (result.success) {
			navigate(appRoutes.admin);
		} else {
			setError(result.error || t('login.loginFailed', { defaultValue: "登录失败，请检查 API Key 后重试" }));
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
		<Container className={styles.loginContainer}>
			<div className={styles.loginCard}>
				<div className={styles.loginHeader}>
					<div className={styles.loginIcon}>
						<Key size={24} />
					</div>
					<h1 className={styles.loginTitle}>{t('login.title', { defaultValue: "JSON Base" })}</h1>
					<p className={styles.loginSubtitle}>{t('login.subtitle', { defaultValue: "Cloudflare Workers JSON 存储服务" })}</p>
				</div>

				<Form fluid onSubmit={handleSubmit}>
					<Form.Group>
						<Form.ControlLabel>{t('login.apiKeyLabel', { defaultValue: "API Key" })}</Form.ControlLabel>
						<div className={styles.loginInputWrapper}>
							<Lock size={16} className={styles.loginInputIcon} />
							<Input
								type="password"
								value={apiKey}
								onChange={(value) => {
									setApiKey(value);
									setError('');
								}}
								onKeyDown={handleKeyDown}
								placeholder={t('login.placeholder', { defaultValue: "请输入您的 API Key" })}
								size="lg"
								disabled={loading}
								className={styles.loginInput}
							/>
						</div>
					</Form.Group>

					{error && <div className={styles.loginError}>{error}</div>}

					<Form.Group>
						<Button
							appearance="primary"
							onClick={handleSubmit}
							loading={loading}
							size="lg"
							block
							className={styles.loginButton}
						>
							<span className={styles.loginButtonContent}>
								{t('login.submit', { defaultValue: "验证并登录" })}
								<ArrowRight size={16} />
							</span>
						</Button>
					</Form.Group>
				</Form>

				<div className={styles.loginFooter}>
					<p>{t('login.footer', { defaultValue: "输入 API Key 以访问管理控制台" })}</p>
				</div>
			</div>
		</Container>
	);
};

export default LoginPage;
