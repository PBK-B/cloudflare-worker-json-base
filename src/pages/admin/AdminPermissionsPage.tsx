import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, InputNumber, Modal, SelectPicker, Table, Toggle } from 'rsuite';
import { Plus, Trash2, Edit3, Search, Sparkles, EyeOff, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PermissionAction, PermissionDecision, PermissionMode, PermissionRule, PermissionRuleInput } from '../../types';
import { useApi } from '../../hooks/useApi';
import { notify } from '../../utils/notification';
import styles from './AdminPermissionsPage.module.scss';

const { Column, HeaderCell, Cell } = Table;

const MODE_OPTIONS: Array<{ labelKey: string; value: PermissionMode }> = [
	{ labelKey: 'permissions.modes.private_rw', value: 'private_rw' },
	{ labelKey: 'permissions.modes.public_rw', value: 'public_rw' },
	{ labelKey: 'permissions.modes.private_read_public_write', value: 'private_read_public_write' },
	{ labelKey: 'permissions.modes.public_read_private_write', value: 'public_read_private_write' },
];

type StatusFilter = 'all' | 'enabled' | 'disabled';

const AdminPermissionsPage: React.FC = () => {
	const { t } = useTranslation();
	const {
		listPermissionRules,
		createPermissionRule,
		updatePermissionRule,
		setPermissionRuleStatus,
		deletePermissionRule,
		evaluatePermissionRule,
	} = useApi();

	const [rules, setRules] = useState<PermissionRule[]>([]);
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState('');
	const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
	const [modalOpen, setModalOpen] = useState(false);
	const [editingRule, setEditingRule] = useState<PermissionRule | null>(null);
	const [submitLoading, setSubmitLoading] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<PermissionRule | null>(null);
	const [formValue, setFormValue] = useState<PermissionRuleInput>({
		pattern: '',
		mode: 'public_rw',
		priority: 100,
		enabled: true,
		description: '',
	});
	const [testerPath, setTesterPath] = useState('');
	const [testerAction, setTesterAction] = useState<PermissionAction>('read');
	const [evaluation, setEvaluation] = useState<PermissionDecision | null>(null);
	const [evaluationLoading, setEvaluationLoading] = useState(false);

	const statusOptions = useMemo(
		() => [
			{ label: t('permissions.filters.all', { defaultValue: '全部' }), value: 'all' },
			{ label: t('permissions.filters.enabled', { defaultValue: '仅启用' }), value: 'enabled' },
			{ label: t('permissions.filters.disabled', { defaultValue: '仅禁用' }), value: 'disabled' },
		],
		[t],
	);

	const modeOptions = useMemo(
		() =>
			MODE_OPTIONS.map((option) => ({
				label: t(option.labelKey),
				value: option.value,
			})),
		[t],
	);

	const actionOptions = useMemo(
		() => [
			{ label: t('permissions.actions.read', { defaultValue: '读' }), value: 'read' },
			{ label: t('permissions.actions.write', { defaultValue: '写' }), value: 'write' },
		],
		[t],
	);

	const loadRules = useCallback(async () => {
		setLoading(true);
		try {
			const enabled = statusFilter === 'all' ? undefined : statusFilter === 'enabled';
			const response = await listPermissionRules(enabled, search || undefined);
			if (response.success && response.data) {
				setRules(response.data.items);
			} else {
				notify.error(response.error || t('permissions.messages.loadFailed', { defaultValue: '获取权限规则失败' }));
			}
		} finally {
			setLoading(false);
		}
	}, [listPermissionRules, search, statusFilter, t]);

	useEffect(() => {
		void loadRules();
	}, [loadRules]);

	const resetForm = useCallback(() => {
		setEditingRule(null);
		setFormValue({
			pattern: '',
			mode: 'public_rw',
			priority: 100,
			enabled: true,
			description: '',
		});
	}, []);

	const openCreateModal = () => {
		resetForm();
		setModalOpen(true);
	};

	const openEditModal = (rule: PermissionRule) => {
		setEditingRule(rule);
		setFormValue({
			pattern: rule.pattern,
			mode: rule.mode,
			priority: rule.priority,
			enabled: rule.enabled,
			description: rule.description || '',
		});
		setModalOpen(true);
	};

	const handleSubmit = async () => {
		setSubmitLoading(true);
		try {
			const response = editingRule ? await updatePermissionRule(editingRule.id, formValue) : await createPermissionRule(formValue);

			if (response.success) {
				notify.success(
					editingRule
						? t('permissions.messages.updateSuccess', { defaultValue: '权限规则更新成功' })
						: t('permissions.messages.createSuccess', { defaultValue: '权限规则创建成功' }),
				);
				setModalOpen(false);
				resetForm();
				await loadRules();
				return;
			}

			notify.error(response.error || t('permissions.messages.saveFailed', { defaultValue: '保存权限规则失败' }));
		} finally {
			setSubmitLoading(false);
		}
	};

	const handleToggleStatus = async (rule: PermissionRule, enabled: boolean) => {
		const response = await setPermissionRuleStatus(rule.id, enabled);
		if (response.success) {
			notify.success(
				enabled
					? t('permissions.messages.enabled', { defaultValue: '规则已启用' })
					: t('permissions.messages.disabled', { defaultValue: '规则已禁用' }),
			);
			await loadRules();
			return;
		}

		notify.error(response.error || t('permissions.messages.statusFailed', { defaultValue: '切换规则状态失败' }));
	};

	const handleDelete = async () => {
		if (!deleteTarget) {
			return;
		}

		const response = await deletePermissionRule(deleteTarget.id);
		if (response.success) {
			notify.success(t('permissions.messages.deleteSuccess', { defaultValue: '权限规则已删除' }));
			setDeleteTarget(null);
			await loadRules();
			return;
		}

		notify.error(response.error || t('permissions.messages.deleteFailed', { defaultValue: '删除权限规则失败' }));
	};

	const runEvaluation = async () => {
		setEvaluationLoading(true);
		try {
			const response = await evaluatePermissionRule({ path: testerPath, action: testerAction });
			if (response.success && response.data) {
				setEvaluation(response.data);
				return;
			}

			notify.error(response.error || t('permissions.messages.evaluateFailed', { defaultValue: '权限规则测试失败' }));
		} finally {
			setEvaluationLoading(false);
		}
	};

	const renderModeLabel = (mode: PermissionMode) => t(`permissions.modes.${mode}`);

	return (
		<div className={styles.adminPermissionsPage}>
			<div className={styles.permissionsControls}>
				<div className={styles.permissionsHeader}>
					<div>
						<h4 className={styles.sectionTitle}>
							<span>{t('permissions.title', { defaultValue: '权限管理' })}</span>
						</h4>
						<p className={styles.sectionDescription}>
							{t('permissions.description', { defaultValue: '按路径规则控制资源的公开读写权限，支持 * 与 ** 通配匹配。' })}
						</p>
					</div>
				</div>

				<div className={styles.controlsRow}>
					<Input
						className={styles.searchInput}
						value={search}
						onChange={setSearch}
						placeholder={t('permissions.searchPlaceholder', { defaultValue: '搜索路径规则或说明...' })}
					/>
					<SelectPicker
						data={statusOptions}
						cleanable={false}
						searchable={false}
						value={statusFilter}
						onChange={(value) => setStatusFilter((value as StatusFilter) || 'all')}
						className={styles.filterPicker}
					/>
					<Button appearance="default" className={styles.searchButton} onClick={() => void loadRules()}>
						<Search size={16} /> {t('permissions.search', { defaultValue: '查询' })}
					</Button>
				</div>

				<div className={styles.sortRow}>
					<Button appearance="primary" className={styles.createButton} size="sm" onClick={openCreateModal}>
						<Plus size={14} /> {t('permissions.create', { defaultValue: '新增规则' })}
					</Button>
				</div>
			</div>

			<div className={styles.tableContainer}>
				<Table height={420} data={rules} loading={loading} autoHeight rowKey="id">
					<Column flexGrow={1.3} minWidth={220}>
						<HeaderCell>{t('permissions.table.pattern', { defaultValue: '匹配规则' })}</HeaderCell>
						<Cell>{(rowData: PermissionRule) => <span className={styles.patternText}>{rowData.pattern}</span>}</Cell>
					</Column>
					<Column flexGrow={1.2} minWidth={220}>
						<HeaderCell>{t('permissions.table.mode', { defaultValue: '权限模式' })}</HeaderCell>
						<Cell>{(rowData: PermissionRule) => renderModeLabel(rowData.mode)}</Cell>
					</Column>
					<Column width={110}>
						<HeaderCell>{t('permissions.table.priority', { defaultValue: '优先级' })}</HeaderCell>
						<Cell>{(rowData: PermissionRule) => rowData.priority}</Cell>
					</Column>
					<Column width={120}>
						<HeaderCell>{t('permissions.table.status', { defaultValue: '状态' })}</HeaderCell>
						<Cell>
							{(rowData: PermissionRule) => (
								<span className={rowData.enabled ? styles.statusEnabled : styles.statusDisabled}>
									{rowData.enabled
										? t('permissions.status.enabled', { defaultValue: '已启用' })
										: t('permissions.status.disabled', { defaultValue: '已禁用' })}
								</span>
							)}
						</Cell>
					</Column>
					<Column flexGrow={1} minWidth={180}>
						<HeaderCell>{t('permissions.table.description', { defaultValue: '说明' })}</HeaderCell>
						<Cell>{(rowData: PermissionRule) => rowData.description || '-'}</Cell>
					</Column>
						<Column width={180} fixed="right">
						<HeaderCell>{t('permissions.table.actions', { defaultValue: '操作' })}</HeaderCell>
						<Cell>
							{(rowData: PermissionRule) => (
								<div className={styles.actionRow}>
									<Button
										size="sm"
										appearance="link"
										className={`${rowData.enabled ? styles.disableAction : styles.enableAction} ${styles.primaryAction}`}
										onClick={() => {
											void handleToggleStatus(rowData, !rowData.enabled);
										}}
									>
										{rowData.enabled ? <EyeOff size={14} /> : <Eye size={14} />}
										{rowData.enabled
											? t('permissions.operations.disable', { defaultValue: '禁用' })
											: t('permissions.operations.enable', { defaultValue: '启用' })}
									</Button>
									<Button size="sm" appearance="subtle" onClick={() => openEditModal(rowData)}>
										<Edit3 size={14} />
									</Button>
									<Button size="sm" appearance="subtle" color="red" onClick={() => setDeleteTarget(rowData)}>
										<Trash2 size={14} />
									</Button>
								</div>
							)}
						</Cell>
					</Column>
				</Table>
			</div>

			<section className={styles.testerPanel}>
				<div className={styles.testerHeader}>
					<div>
						<h4 className={styles.sectionTitle}>
							<Sparkles size={18} />
							<span>{t('permissions.tester.title', { defaultValue: '路径测试器' })}</span>
						</h4>
						<p className={styles.sectionDescription}>
							{t('permissions.tester.description', { defaultValue: '输入路径和操作类型，查看当前启用规则下的最终权限结果。' })}
						</p>
					</div>
				</div>
				<div className={styles.testerControls}>
					<Input value={testerPath} onChange={setTesterPath} placeholder="/public/images/logo.png" />
					<SelectPicker
						data={actionOptions}
						cleanable={false}
						searchable={false}
						value={testerAction}
						onChange={(value) => setTesterAction((value as PermissionAction) || 'read')}
					/>
					<Button appearance="primary" onClick={() => void runEvaluation()} loading={evaluationLoading}>
						{t('permissions.tester.run', { defaultValue: '开始测试' })}
					</Button>
				</div>
				<div
					className={`${styles.evaluationCard} ${
						evaluation ? (evaluation.allowed ? styles.evaluationAllowed : styles.evaluationPrivate) : styles.evaluationIdle
					}`}
				>
					{evaluation ? (
						<>
							<div className={styles.evaluationHeadline}>
								<span>
									{evaluation.allowed
										? t('permissions.tester.publicAccess', { defaultValue: '当前操作为公开访问' })
										: t('permissions.tester.privateAccess', { defaultValue: '当前操作需要私有访问' })}
								</span>
								<strong>{renderModeLabel(evaluation.mode)}</strong>
							</div>
							<p>
								{t('permissions.tester.matchedRule', { defaultValue: '命中规则：' })}{' '}
								{evaluation.matchedRule
									? evaluation.matchedRule.pattern
									: t('permissions.tester.defaultRule', { defaultValue: '未命中规则，使用默认 private_rw' })}
							</p>
						</>
					) : (
						<div className={styles.evaluationPlaceholder}>
							<p>{t('permissions.tester.placeholder', { defaultValue: '输入路径并开始测试后，在这里查看命中规则与最终权限结果。' })}</p>
						</div>
					)}
				</div>
			</section>

			<Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md">
				<Modal.Header>
					<Modal.Title>
						{editingRule
							? t('permissions.editTitle', { defaultValue: '编辑权限规则' })
							: t('permissions.createTitle', { defaultValue: '新增权限规则' })}
					</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<Form
						fluid
						formValue={formValue as unknown as Record<string, unknown>}
						onChange={(value) => setFormValue(value as PermissionRuleInput)}
					>
						<Form.Group controlId="pattern">
							<Form.ControlLabel>{t('permissions.form.pattern', { defaultValue: '匹配规则' })}</Form.ControlLabel>
							<Form.Control accepter={Input} name="pattern" placeholder="/public/**" />
							<div className={styles.formHint}>
								{t('permissions.form.patternHint', { defaultValue: '支持 /foo/*、/foo/**、/**/*.png 这类路径匹配规则。' })}
							</div>
						</Form.Group>
						<div className={styles.formGridRow}>
							<Form.Group controlId="mode" className={styles.formGridField}>
								<Form.ControlLabel>{t('permissions.form.mode', { defaultValue: '权限模式' })}</Form.ControlLabel>
								<Form.Control accepter={SelectPicker} searchable={false} cleanable={false} data={modeOptions} name="mode" />
							</Form.Group>
							<Form.Group controlId="priority" className={styles.formGridField}>
								<Form.ControlLabel>{t('permissions.form.priority', { defaultValue: '优先级' })}</Form.ControlLabel>
								<Form.Control accepter={InputNumber} name="priority" min={0} step={10} />
								<div className={styles.formHint}>
									{t('permissions.form.priorityHint', { defaultValue: '数值越大优先级越高，多条规则命中时先应用高优先级规则。' })}
								</div>
							</Form.Group>
							<Form.Group controlId="enabled" className={`${styles.formGridField} ${styles.formGridFieldEnabled}`}>
								<Form.ControlLabel>{t('permissions.form.enabled', { defaultValue: '启用状态' })}</Form.ControlLabel>
								<div className={styles.toggleFieldWrap}>
									<Toggle
										checked={formValue.enabled !== false}
										onChange={(checked) => setFormValue((prev) => ({ ...prev, enabled: checked }))}
									/>
								</div>
							</Form.Group>
						</div>
						<Form.Group controlId="description">
							<Form.ControlLabel>{t('permissions.form.description', { defaultValue: '说明' })}</Form.ControlLabel>
							<Input
								as="textarea"
								rows={4}
								value={formValue.description || ''}
								onChange={(value) => setFormValue((prev) => ({ ...prev, description: value }))}
							/>
						</Form.Group>
					</Form>
				</Modal.Body>
				<Modal.Footer>
					<Button onClick={() => setModalOpen(false)} appearance="subtle">
						{t('permissions.cancel', { defaultValue: '取消' })}
					</Button>
					<Button onClick={() => void handleSubmit()} appearance="primary" loading={submitLoading}>
						{t('permissions.save', { defaultValue: '保存' })}
					</Button>
				</Modal.Footer>
			</Modal>

			<Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} size="xs">
				<Modal.Header>
					<Modal.Title>{t('permissions.deleteTitle', { defaultValue: '删除权限规则' })}</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					{t('permissions.deleteConfirm', { defaultValue: '确定要删除规则 {{pattern}} 吗？', pattern: deleteTarget?.pattern || '' })}
				</Modal.Body>
				<Modal.Footer>
					<Button onClick={() => setDeleteTarget(null)} appearance="subtle">
						{t('permissions.cancel', { defaultValue: '取消' })}
					</Button>
					<Button onClick={() => void handleDelete()} appearance="primary" color="red">
						{t('permissions.delete', { defaultValue: '删除' })}
					</Button>
				</Modal.Footer>
			</Modal>
		</div>
	);
};

export default AdminPermissionsPage;
