import React from 'react';
import { Modal, Form, Input, InputPicker, Button, Uploader } from 'rsuite';
import { Plus, Edit, Upload, File, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { notify } from '../../utils/notification';

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

	React.useEffect(() => {
		if (initialData) {
			setFormData(initialData);
			setUploadedFile(null);
		} else if (show) {
			setFormData({
				path: '',
				value: '',
				type: initialType,
			});
			setUploadedFile(null);
		}
	}, [initialData, show, initialType]);

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
	};

	const handleFileUpload = (fileList: any[]) => {
		if (!fileList || fileList.length === 0) {
			return false;
		}

		const fileObj = fileList[0];

		if (fileObj?.blobFile) {
			const blobFile = fileObj.blobFile as File;
			if (blobFile.size > 0) {
				setUploadedFile(blobFile);
				setFormData((prev) => ({ ...prev, value: blobFile.name }));
			}
		} else if (fileObj.file) {
			const file = fileObj.file as File;
			if (file.size > 0) {
				setUploadedFile(file);
				setFormData((prev) => ({ ...prev, value: file.name }));
			}
		}

		return false;
	};

	const handleRemoveFile = () => {
		setUploadedFile(null);
		setFormData((prev) => ({ ...prev, value: '' }));
		const fileInput = document.querySelector('.rs-uploader input[type="file"]') as HTMLInputElement;
		if (fileInput) {
			fileInput.value = '';
		}
	};

	const renderValueInput = () => {
		if (formData.type === 'binary') {
			return (
				<div>
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
					<div className="form-hint">{t('modal.fileStorageHint', { defaultValue: "文件将在后端自动转换为 Base64 编码存储" })}</div>
				</div>
			);
		}

		return (
			<Input
				as="textarea"
				rows={10}
				value={formData.value}
				onChange={(value) => setFormData((prev) => ({ ...prev, value }))}
				placeholder={formData.type === 'json' ? t('modal.jsonPlaceholder', { defaultValue: "输入 JSON 数据，例如: {\"key\": \"value\"}" }) : t('modal.textPlaceholder', { defaultValue: "输入文本内容" })}
				size="lg"
			/>
		);
	};

	return (
		<Modal open={show} onClose={onClose}>
			<Modal.Header>
				<Modal.Title className="modal-title" style={{ display: 'flex', flexDirection: 'row' }}>
					<li style={{ display: 'flex', flexDirection: 'row' }}>{mode === 'create' ? <Plus size={18} /> : <Edit size={18} />}</li>
					{title}
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Form fluid>
					<Form.Group>
						<Form.ControlLabel>{t('modal.path', { defaultValue: "路径" })}</Form.ControlLabel>
						<Input
							value={formData.path}
							onChange={(value) => setFormData((prev) => ({ ...prev, path: value }))}
							placeholder={t('modal.pathPlaceholder', { defaultValue: "/example/data" })}
							size="lg"
							disabled={mode === 'edit'}
						/>
						<div className="form-hint">{t('modal.pathHint', { defaultValue: "建议使用路径格式，如 /demo/user/profile" })}</div>
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
				<Button onClick={handleSubmit} appearance="primary" loading={loading}>
					{mode === 'create' ? t('modal.create', { defaultValue: "创建" }) : t('modal.update', { defaultValue: "更新" })}
				</Button>
			</Modal.Footer>
		</Modal>
	);
};
