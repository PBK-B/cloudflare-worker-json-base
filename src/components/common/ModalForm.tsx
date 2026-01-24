import React from 'react';
import { Modal, Form, Input, InputPicker, Button } from 'rsuite';
import { Plus, Edit } from 'lucide-react';

interface FormData {
	path: string;
	value: string;
	type: 'json' | 'text' | 'binary';
}

interface ModalFormProps {
	show: boolean;
	onClose: () => void;
	onSubmit: (data: FormData) => Promise<void>;
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
	const [formData, setFormData] = React.useState<FormData>(
		initialData || {
			path: '',
			value: '',
			type: initialType,
		}
	);

	React.useEffect(() => {
		if (initialData) {
			setFormData(initialData);
		} else if (show) {
			setFormData({
				path: '',
				value: '',
				type: initialType,
			});
		}
	}, [initialData, show, initialType]);

	const handleSubmit = async () => {
		if (!formData.path.trim()) {
			alert('请输入路径');
			return;
		}

		if (!formData.value.trim()) {
			alert('请输入数据内容');
			return;
		}

		if (formData.type === 'json') {
			try {
				JSON.parse(formData.value);
			} catch {
				alert('JSON 格式错误，请检查数据格式');
				return;
			}
		}

		await onSubmit(formData);
	};

	const handleTypeChange = (value: unknown) => {
		setFormData((prev) => ({ ...prev, type: value as 'json' | 'text' | 'binary' }));
	};

	return (
		<Modal open={show} onClose={onClose}>
			<Modal.Header>
				<Modal.Title className="modal-title">
					{mode === 'create' ? <Plus size={18} /> : <Edit size={18} />}
					{title}
				</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Form fluid>
					<Form.Group>
						<Form.ControlLabel>路径</Form.ControlLabel>
						<Input
							value={formData.path}
							onChange={(value) => setFormData((prev) => ({ ...prev, path: value }))}
							placeholder="/example/data"
							size="lg"
							disabled={mode === 'edit'}
						/>
						<div className="form-hint">建议使用路径格式，如 /demo/user/profile</div>
					</Form.Group>

					<Form.Group>
						<Form.ControlLabel>数据类型</Form.ControlLabel>
						<InputPicker
							data={[
								{ label: 'JSON 数据', value: 'json' },
								{ label: '文本内容', value: 'text' },
								{ label: '二进制文件', value: 'binary' },
							]}
							value={formData.type}
							onChange={handleTypeChange}
							size="lg"
							disabled={mode === 'edit'}
						/>
					</Form.Group>

					<Form.Group>
						<Form.ControlLabel>数据内容</Form.ControlLabel>
						<Input
							as="textarea"
							rows={10}
							value={formData.value}
							onChange={(value) => setFormData((prev) => ({ ...prev, value }))}
							placeholder={
								formData.type === 'json'
									? '输入 JSON 数据，例如: {"key": "value"}'
									: formData.type === 'text'
									? '输入文本内容'
									: '输入 Base64 编码的二进制数据'
							}
							size="lg"
						/>
					</Form.Group>
				</Form>
			</Modal.Body>
			<Modal.Footer>
				<Button onClick={onClose} appearance="subtle">
					取消
				</Button>
				<Button onClick={handleSubmit} appearance="primary" loading={loading}>
					{mode === 'create' ? '创建' : '更新'}
				</Button>
			</Modal.Footer>
		</Modal>
	);
};
