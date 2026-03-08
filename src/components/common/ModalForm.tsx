import React from 'react';
import { Modal, Form, Input, InputPicker, Button, Uploader } from 'rsuite';
import { Plus, Edit, Upload, File, X, Eye, Pencil, Minimize2, AlignLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { notify } from '../../utils/notification';
import styles from './ModalForm.module.scss';

interface FormData {
	path: string;
	value: string;
	type: 'json' | 'text' | 'binary';
}

interface ModalFormProps {
	show: boolean;
	onClose: () => void;
	onSubmit: (data: FormData, file?: File) => Promise<void>;
	title: string;
	initialData?: FormData;
	initialType?: 'json' | 'text' | 'binary';
	loading?: boolean;
	mode: 'create' | 'edit';
	allowBinaryEdit?: boolean;
	backdrop?: boolean | 'static';
	keyboard?: boolean;
}

export const ModalForm: React.FC<ModalFormProps> = ({
	show,
	onClose,
	onSubmit,
	title,
	initialData,
	initialType = 'json',
	loading = false,
	mode,
	allowBinaryEdit = false,
	backdrop = true,
	keyboard = true,
}) => {
	const { t } = useTranslation();
	const [formData, setFormData] = React.useState<FormData>(
		initialData || {
			path: '',
			value: '',
			type: initialType,
		},
	);
	const [uploadedFile, setUploadedFile] = React.useState<File | null>(null);
	const [isUploading, setIsUploading] = React.useState(false);
	const [autoFilledPath, setAutoFilledPath] = React.useState(false);
	const [jsonPreviewMode, setJsonPreviewMode] = React.useState(false);
	const [jsonPreviewValue, setJsonPreviewValue] = React.useState('');
	const [jsonEditScrollTop, setJsonEditScrollTop] = React.useState(0);
	const [jsonPreviewScrollTop, setJsonPreviewScrollTop] = React.useState(0);
	const [jsonEditorHeight, setJsonEditorHeight] = React.useState(276);
	const jsonPreviewRef = React.useRef<HTMLPreElement | null>(null);
	const jsonTextareaRef = React.useRef<HTMLTextAreaElement | null>(null);

	const formatJsonString = React.useCallback((value: string) => {
		const trimmedValue = value.trim();

		if (!trimmedValue) {
			return '';
		}

		return JSON.stringify(JSON.parse(trimmedValue), null, 2);
	}, []);

	const compactJsonString = React.useCallback((value: string) => {
		const trimmedValue = value.trim();

		if (!trimmedValue) {
			return '';
		}

		return JSON.stringify(JSON.parse(trimmedValue));
	}, []);

	const derivePathFromFile = React.useCallback((file: File) => {
		const rawName = (file.webkitRelativePath || file.name || '').trim();
		const normalizedName = rawName.replace(/\\/g, '/').replace(/^\/+/, '');

		if (!normalizedName) {
			return '';
		}

		return `/${normalizedName}`;
	}, []);

	React.useEffect(() => {
		if (initialData) {
			setFormData({
				...initialData,
				value: initialData.type === 'json' ? formatJsonString(initialData.value) : initialData.value,
			});
			setUploadedFile(null);
			setAutoFilledPath(false);
			setJsonPreviewMode(false);
			setJsonPreviewValue('');
			setJsonEditScrollTop(0);
			setJsonPreviewScrollTop(0);
			setJsonEditorHeight(276);
		} else if (show) {
			setFormData({
				path: '',
				value: '',
				type: initialType,
			});
			setUploadedFile(null);
			setAutoFilledPath(false);
			setJsonPreviewMode(false);
			setJsonPreviewValue('');
			setJsonEditScrollTop(0);
			setJsonPreviewScrollTop(0);
			setJsonEditorHeight(276);
		}
	}, [formatJsonString, initialData, show, initialType]);

	React.useLayoutEffect(() => {
		const textarea = jsonTextareaRef.current;

		if (!textarea) {
			return;
		}

		const syncHeight = () => {
			setJsonEditorHeight(textarea.offsetHeight || 276);
		};

		syncHeight();

		const resizeObserver = new ResizeObserver(() => {
			syncHeight();
		});

		resizeObserver.observe(textarea);

		return () => {
			resizeObserver.disconnect();
		};
	}, [jsonPreviewMode, show]);

	React.useLayoutEffect(() => {
		if (jsonPreviewMode) {
			return;
		}

		const target = jsonTextareaRef.current;

		if (!target) {
			return;
		}

		target.scrollTop = jsonEditScrollTop;
	}, [jsonEditScrollTop, jsonPreviewMode]);

	React.useLayoutEffect(() => {
		if (!jsonPreviewMode) {
			return;
		}

		const target = jsonPreviewRef.current;

		if (!target) {
			return;
		}

		target.scrollTop = jsonPreviewScrollTop;
	}, [jsonPreviewMode, jsonPreviewScrollTop, jsonPreviewValue]);

	const handleSubmit = async () => {
		if (!formData.path.trim()) {
			notify.warning(t('modal.pathRequired', { defaultValue: "请输入路径" }));
			return;
		}

		if (formData.type === 'binary') {
			if (!uploadedFile && !formData.value) {
				notify.warning(t('modal.uploadRequired', { defaultValue: "请上传文件" }));
				return;
			}

			if (mode === 'edit' && !allowBinaryEdit) {
				notify.warning(t('modal.binaryEditDisabled', { defaultValue: "二进制文件不支持直接编辑" }));
				return;
			}
		} else {
			if (!formData.value.trim()) {
				notify.warning(t('modal.contentRequired', { defaultValue: "请输入数据内容" }));
				return;
			}
		}

		if (formData.type === 'json') {
			try {
				JSON.parse(formData.value);
			} catch {
				notify.warning(t('modal.jsonInvalid', { defaultValue: "JSON 格式错误，请检查数据格式" }));
				return;
			}
		}

		await onSubmit(formData, uploadedFile || undefined);
	};

	const handleTypeChange = (value: unknown) => {
		setFormData((prev) => ({ ...prev, type: value as 'json' | 'text' | 'binary', value: '' }));
		setUploadedFile(null);
		setAutoFilledPath(false);
		setJsonPreviewMode(false);
		setJsonPreviewValue('');
		setJsonEditScrollTop(0);
		setJsonPreviewScrollTop(0);
		setJsonEditorHeight(276);
	};

	const updateJsonValue = React.useCallback((transform: (value: string) => string) => {
		try {
			if (jsonPreviewMode) {
				const nextPreviewValue = transform(jsonPreviewValue || formData.value);
				setJsonPreviewValue(nextPreviewValue);
				return;
			}

			const nextValue = transform(formData.value);
			setFormData((prev) => ({ ...prev, value: nextValue }));
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : t('modal.unknownError', { defaultValue: '未知错误' });
			notify.warning(`${t('modal.jsonInvalid', { defaultValue: "JSON 格式错误，请检查数据格式" })}: ${errorMessage}`);
		}
	}, [formData.value, jsonPreviewMode, jsonPreviewValue, t]);

	const handleToggleJsonPreview = React.useCallback(() => {
		if (jsonPreviewMode) {
			setJsonPreviewScrollTop(jsonPreviewRef.current?.scrollTop ?? jsonPreviewScrollTop);
			setJsonPreviewMode(false);
			setJsonPreviewValue('');
			return;
		}

		try {
			JSON.parse(formData.value);
			const currentEditScrollTop = jsonTextareaRef.current?.scrollTop ?? jsonEditScrollTop;
			setJsonEditScrollTop(currentEditScrollTop);
			setJsonPreviewScrollTop(currentEditScrollTop);
			setJsonPreviewValue(formData.value);
			setJsonPreviewMode(true);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : t('modal.unknownError', { defaultValue: '未知错误' });
			notify.warning(`${t('modal.jsonInvalid', { defaultValue: "JSON 格式错误，请检查数据格式" })}: ${errorMessage}`);
		}
	}, [formData.value, jsonEditScrollTop, jsonPreviewMode, jsonPreviewScrollTop, t]);

	const handleCompactJson = React.useCallback(() => {
		updateJsonValue(compactJsonString);
	}, [compactJsonString, updateJsonValue]);

	const handleFormatJson = React.useCallback(() => {
		updateJsonValue(formatJsonString);
	}, [formatJsonString, updateJsonValue]);

	const handleFileUpload = (fileList: any[]) => {
		if (!fileList || fileList.length === 0) {
			return false;
		}

		const fileObj = fileList[0];

		if (fileObj?.blobFile) {
			const blobFile = fileObj.blobFile as File;
			if (blobFile.size > 0) {
				const derivedPath = derivePathFromFile(blobFile);
				setUploadedFile(blobFile);
				setFormData((prev) => {
					const shouldAutoFillPath = !prev.path.trim();
					setAutoFilledPath(Boolean(shouldAutoFillPath && derivedPath));

					return {
						...prev,
						path: shouldAutoFillPath ? derivedPath : prev.path,
						value: blobFile.name,
					};
				});
			}
		} else if (fileObj.file) {
			const file = fileObj.file as File;
			if (file.size > 0) {
				const derivedPath = derivePathFromFile(file);
				setUploadedFile(file);
				setFormData((prev) => {
					const shouldAutoFillPath = !prev.path.trim();
					setAutoFilledPath(Boolean(shouldAutoFillPath && derivedPath));

					return {
						...prev,
						path: shouldAutoFillPath ? derivedPath : prev.path,
						value: file.name,
					};
				});
			}
		}

		return false;
	};

	const handleRemoveFile = () => {
		const derivedPath = uploadedFile ? derivePathFromFile(uploadedFile) : '';
		setUploadedFile(null);
		setFormData((prev) => ({
			...prev,
			path: autoFilledPath && derivedPath && prev.path === derivedPath ? '' : prev.path,
			value: '',
		}));
		setAutoFilledPath(false);
		const fileInput = document.querySelector('.rs-uploader input[type="file"]') as HTMLInputElement;
		if (fileInput) {
			fileInput.value = '';
		}
	};

	const renderValueInput = () => {
		if (formData.type === 'binary') {
			return (
				<div>
					{mode === 'edit' && allowBinaryEdit ? (
						<div className={styles.formHint}>{t('modal.binaryReplaceHint', { defaultValue: "重新上传文件后会覆盖当前资源内容。" })}</div>
					) : null}
					<Uploader
						fileList={uploadedFile ? [{ name: uploadedFile.name, fileKey: uploadedFile.name }] : []}
						onChange={handleFileUpload}
						onRemove={handleRemoveFile}
						accept="*"
						autoUpload={false}
						multiple={false}
						draggable
						size="lg"
						action=""
						disabled={isUploading}
						fileListVisible={false}
					>
						<div
							style={{
								display: 'flex',
								flexDirection: uploadedFile ? 'row' : 'column',
								alignItems: uploadedFile ? 'flex-start' : 'center',
								gap: '8px',
								padding: uploadedFile ? '8px 12px' : '20px',
								textAlign: 'center',
								border: '1px dashed #d9d9d9',
								borderRadius: '4px',
								boxSizing: 'border-box',
								height: '100%',
								justifyContent: uploadedFile ? 'flex-start' : 'center',
							}}
						>
							{uploadedFile ? (
								<>
									<File size={18} />
									<span
										style={{
											flex: 1,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
											textAlign: 'start',
										}}
										title={uploadedFile.webkitRelativePath || uploadedFile.name}
									>
										{uploadedFile.webkitRelativePath || uploadedFile.name}
									</span>
									<span style={{ color: '#999', fontSize: '12px', marginLeft: '8px' }}>
										{uploadedFile ? (uploadedFile.size / 1024).toFixed(1) : 0} {t('modal.kbUnit', { defaultValue: "KB" })}
									</span>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											handleRemoveFile();
										}}
										style={{
											background: 'none',
											border: 'none',
											cursor: 'pointer',
											padding: '2px',
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'center',
											marginLeft: '8px',
										}}
									>
										<X size={16} style={{ color: '#999' }} />
									</button>
								</>
							) : (
								<>
									<Upload size={32} style={{ color: '#999', marginBottom: '8px' }} />
									<p style={{ color: '#666', margin: 0 }}>{isUploading ? t('modal.fileProcessing', { defaultValue: "文件处理中..." }) : t('modal.fileDropHint', { defaultValue: "点击或拖拽文件到此处上传" })}</p>
									<p style={{ color: '#999', fontSize: '12px', margin: '4px 0 0 0' }}>{t('modal.fileSupportHint', { defaultValue: "支持任意文件格式" })}</p>
								</>
							)}
						</div>
					</Uploader>
					<div className={styles.formHint}>{mode === 'edit' ? t('modal.fileReplaceStorageHint', { defaultValue: "上传新文件后会替换当前资源内容。" }) : t('modal.fileStorageHint', { defaultValue: "文件将在后端自动转换为 Base64 编码存储" })}</div>
				</div>
			);
		}

		if (formData.type === 'json') {
			return (
				<div className={styles.jsonEditorShell}>
					<div className={styles.jsonToolbar}>
						<button
							type="button"
							className={styles.jsonToolbarButton}
							onClick={handleToggleJsonPreview}
							title={jsonPreviewMode
								? t('modal.jsonSwitchToEdit', { defaultValue: '切换到编辑' })
								: t('modal.jsonSwitchToPreview', { defaultValue: '切换到预览' })}
						>
							{jsonPreviewMode ? <Pencil size={14} /> : <Eye size={14} />}
						</button>
						<button
							type="button"
							className={styles.jsonToolbarButton}
							onClick={handleCompactJson}
							title={t('modal.jsonCompact', { defaultValue: '压缩 JSON' })}
						>
							<Minimize2 size={14} />
						</button>
						<button
							type="button"
							className={styles.jsonToolbarButton}
							onClick={handleFormatJson}
							title={t('modal.jsonFormat', { defaultValue: '格式化 JSON' })}
						>
							<AlignLeft size={14} />
						</button>
					</div>

					<div className={styles.jsonSurface} style={{ ['--json-editor-height' as string]: `${jsonEditorHeight}px` }}>
						<Input
							as="textarea"
							className={`${styles.jsonTextarea} ${jsonPreviewMode ? styles.jsonPaneHidden : ''}`}
							rows={10}
							value={formData.value}
							onChange={(value) => setFormData((prev) => ({ ...prev, value }))}
							onScroll={(event) => {
								const scrollTop = (event.target as HTMLTextAreaElement).scrollTop;
								setJsonEditScrollTop(scrollTop);
							}}
							placeholder={t('modal.jsonPlaceholder', { defaultValue: "输入 JSON 数据，例如: {\"key\": \"value\"}" })}
							size="lg"
							inputRef={jsonTextareaRef}
						/>
						<pre
							ref={jsonPreviewRef}
							className={`${styles.jsonPreview} ${jsonPreviewMode ? '' : styles.jsonPaneHidden}`}
							onScroll={(event) => setJsonPreviewScrollTop((event.target as HTMLPreElement).scrollTop)}
						>
							{jsonPreviewValue}
						</pre>
					</div>
				</div>
			);
		}

		return (
			<Input
				as="textarea"
				rows={10}
				value={formData.value}
				onChange={(value) => setFormData((prev) => ({ ...prev, value }))}
				placeholder={t('modal.textPlaceholder', { defaultValue: "输入文本内容" })}
				size="lg"
			/>
		);
	};

	return (
		<Modal open={show} onClose={onClose} backdrop={backdrop} keyboard={keyboard}>
			<Modal.Header>
				<Modal.Title className={styles.modalTitle}>
					<span className={styles.modalTitleIcon}>{mode === 'create' ? <Plus size={18} /> : <Edit size={18} />}</span>
					{title}
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Form fluid>
					<Form.Group>
						<Form.ControlLabel>{t('modal.path', { defaultValue: "路径" })}</Form.ControlLabel>
						<Input
							value={formData.path}
							onChange={(value) => {
								if (autoFilledPath && value !== formData.path) {
									setAutoFilledPath(false);
								}
								setFormData((prev) => ({ ...prev, path: value }));
							}}
							placeholder={t('modal.pathPlaceholder', { defaultValue: "/example/data" })}
							size="lg"
							disabled={mode === 'edit'}
						/>
						<div className={styles.formHint}>{t('modal.pathHint', { defaultValue: "建议使用路径格式，如 /demo/user/profile" })}</div>
					</Form.Group>

					<Form.Group>
						<Form.ControlLabel>{t('modal.type', { defaultValue: "数据类型" })}</Form.ControlLabel>
						<InputPicker
							data={[
								{ label: t('modal.typeJson', { defaultValue: "JSON 数据" }), value: 'json' },
								{ label: t('modal.typeText', { defaultValue: "文本内容" }), value: 'text' },
								{ label: t('modal.typeBinary', { defaultValue: "二进制文件" }), value: 'binary' },
							]}
							value={formData.type}
							onChange={handleTypeChange}
							size="lg"
							disabled={mode === 'edit'}
						/>
					</Form.Group>

					<Form.Group>
						<Form.ControlLabel>{t('modal.content', { defaultValue: "数据内容" })}</Form.ControlLabel>
						{renderValueInput()}
					</Form.Group>
				</Form>
			</Modal.Body>
			<Modal.Footer>
				<Button onClick={onClose} appearance="subtle">
					{t('modal.cancel', { defaultValue: "取消" })}
				</Button>
				<Button onClick={handleSubmit} appearance="primary" loading={loading} disabled={formData.type === 'json' && jsonPreviewMode}>
					{mode === 'create' ? t('modal.create', { defaultValue: "创建" }) : t('modal.update', { defaultValue: "更新" })}
				</Button>
			</Modal.Footer>
		</Modal>
	);
};
