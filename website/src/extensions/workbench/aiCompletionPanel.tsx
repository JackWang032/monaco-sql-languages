import React, { useEffect, useState } from 'react';
import {
	AIModelConfig,
	AIModelType,
	getAICompletionConfigManager
} from '../../languages/helpers/aiCompletionService';

// 简单的样式定义
const styles = {
	container: {
		padding: '16px',
		fontFamily: 'Arial, sans-serif',
		color: '#555',
		height: '100%',
		overflow: 'auto',
		maxWidth: '600px',
		margin: '0 auto',
		minWidth: '300px'
	},
	title: {
		fontSize: '20px',
		fontWeight: 'bold',
		marginBottom: '16px',
		color: '#555'
	},
	section: {
		marginBottom: '20px'
	},
	sectionTitle: {
		fontSize: '16px',
		fontWeight: 'bold',
		marginBottom: '8px'
	},
	form: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '12px'
	},
	formGroup: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '4px'
	},
	label: {
		fontSize: '14px',
		marginBottom: '4px'
	},
	input: {
		padding: '8px 12px',
		fontSize: '14px',
		border: '1px solid #ddd',
		borderRadius: '4px',
		backgroundColor: '#fff',
		color: '#333'
	},
	select: {
		padding: '8px 12px',
		fontSize: '14px',
		border: '1px solid #ddd',
		borderRadius: '4px',
		backgroundColor: '#fff',
		color: '#333'
	},
	checkbox: {
		display: 'flex',
		alignItems: 'center',
		gap: '8px'
	},
	button: {
		padding: '8px 16px',
		fontSize: '14px',
		fontWeight: 'bold',
		backgroundColor: '#007acc',
		color: 'white',
		border: 'none',
		borderRadius: '4px',
		cursor: 'pointer'
	},
	buttonDisabled: {
		backgroundColor: '#cccccc',
		cursor: 'not-allowed'
	},
	switchContainer: {
		display: 'flex',
		alignItems: 'center',
		gap: '8px',
		marginBottom: '16px'
	},
	switch: {
		position: 'relative' as const,
		display: 'inline-block',
		width: '40px',
		height: '20px'
	},
	switchInput: {
		opacity: 0,
		width: 0,
		height: 0
	},
	switchSlider: {
		position: 'absolute' as const,
		cursor: 'pointer',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: '#ccc',
		transition: '.4s',
		borderRadius: '20px'
	},
	switchSliderChecked: {
		backgroundColor: '#2196F3'
	},
	switchSliderBefore: {
		position: 'absolute' as const,
		content: '',
		height: '16px',
		width: '16px',
		left: '2px',
		bottom: '2px',
		backgroundColor: 'white',
		transition: '.4s',
		borderRadius: '50%'
	},
	switchSliderBeforeChecked: {
		transform: 'translateX(20px)'
	},
	infoText: {
		fontSize: '14px',
		color: '#666',
		marginTop: '8px'
	},
	error: {
		color: '#e74c3c',
		fontSize: '14px',
		marginTop: '4px'
	},
	success: {
		color: '#2ecc71',
		fontSize: '14px',
		marginTop: '4px'
	}
};

const AICompletionPanel: React.FC = () => {
	const configManager = getAICompletionConfigManager();
	const [isEnabled, setIsEnabled] = useState(false);
	const [modelType, setModelType] = useState<AIModelType>(AIModelType.QWEN);
	const [apiKey, setApiKey] = useState('');
	const [model, setModel] = useState('qwen-coder-turbo');
	const [endpoint, setEndpoint] = useState('');
	const [temperature, setTemperature] = useState(0.7);
	const [maxTokens, setMaxTokens] = useState<number>();
	const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
	const [testMessage, setTestMessage] = useState('');

	// 初始化时从配置管理器加载配置
	useEffect(() => {
		// 在应用启动时已经加载了配置，这里只需要获取配置并更新UI
		const config = configManager.getConfig();
		if (config) {
			setModelType(config.type);
			setApiKey(config.apiKey);
			setModel(config.model || 'qwen-coder-turbo');
			setEndpoint(config.endpoint || '');
			setTemperature(config.temperature || 0.7);
			setMaxTokens(undefined);
		}

		setIsEnabled(configManager.getEnabled());
	}, []);

	// 保存配置
	const saveConfig = () => {
		const config: AIModelConfig = {
			type: modelType,
			apiKey,
			model,
			endpoint,
			temperature,
			maxTokens
		};

		configManager.setConfig(config);
		configManager.setEnabled(isEnabled);
		configManager.saveConfig();

		setTestStatus('success');
		setTestMessage('配置已保存, 请刷新页面');
		setTimeout(() => {
			setTestStatus('idle');
			setTestMessage('');
		}, 3000);
	};

	// 测试连接
	const testConnection = async () => {
		setTestStatus('testing');
		setTestMessage('正在测试连接...');

		try {
			// 根据不同的模型类型构建测试请求
			let result = '';
			if (modelType === AIModelType.DEEPSEEK) {
				const apiUrl = endpoint || 'https://api.deepseek.com/beta/completions';
				const response = await fetch(apiUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${apiKey}`
					},
					body: JSON.stringify({
						model: model || 'deepseek-coder',
						prompt: 'print("Hello',
						suffix: 'World")',
						max_tokens: 10
					})
				});

				if (!response.ok || response.status !== 200) {
					let message = await response.text();
					setTestStatus('error');
					setTestMessage(message);
				}

				const data = await response.json();
				result = data.choices?.[0]?.text || '';
			} else if (modelType === AIModelType.QWEN) {
				const apiUrl = endpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1/completions';
				const response = await fetch(apiUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${apiKey}`
					},
					body: JSON.stringify({
						model: model || 'qwen-coder-turbo',
						prompt: '<|fim_prefix|>print(<|fim_suffix|>)<|fim_middle|>',
						max_tokens: 10
					})
				});

				if (!response.ok) {
					throw new Error(`通义千问 API错误: ${response.status} ${response.statusText}`);
				}

				const data = await response.json();
				result = data.choices?.[0]?.text || '';
			}

			console.log('API测试响应:', result);
			setTestStatus('success');
			setTestMessage('连接成功');

			setTimeout(() => {
				setTestStatus('idle');
				setTestMessage('');
			}, 3000);
		} catch (error) {
			console.error('API连接测试失败:', error);
			setTestStatus('error');
			setTestMessage(`连接失败: ${error instanceof Error ? error.message : String(error)}`);

			setTimeout(() => {
				setTestStatus('idle');
				setTestMessage('');
			}, 5000);
		}
	};

	// 渲染不同类型模型的额外配置选项
	const renderModelTypeSpecificOptions = () => {
		switch (modelType) {
			case AIModelType.DEEPSEEK:
				return (
					<>
						<div style={styles.formGroup}>
							<label style={styles.label}>DeepSeek API 端点</label>
							<input
								type="text"
								style={styles.input}
								value={endpoint}
								onChange={(e) => setEndpoint(e.target.value)}
								placeholder="https://api.deepseek.com/beta/completions"
							/>
						</div>
						<div style={styles.formGroup}>
							<label style={styles.label}>模型</label>
							<select
								style={styles.select}
								value={model}
								onChange={(e) => setModel(e.target.value)}
							>
								<option value="deepseek-chat">DeepSeek Chat</option>
								<option value="deepseek-coder">DeepSeek Coder</option>
							</select>
						</div>
					</>
				);
			case AIModelType.QWEN:
				const qwenModelOptions = [
					'qwen-coder-turbo',
					'qwen-coder-plus',
					'qwen-max',
					'qwen2.5-coder-32b-instruct',
					'qwen2.5-coder-3b-instruct'
				];
				return (
					<>
						<div style={styles.formGroup}>
							<label style={styles.label}>通义千问 API 端点</label>
							<input
								type="text"
								style={styles.input}
								value={endpoint}
								onChange={(e) => setEndpoint(e.target.value)}
								placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1/completions"
							/>
						</div>
						<div style={styles.formGroup}>
							<label style={styles.label}>QWEN 模型</label>
							<select
								style={styles.select}
								value={model}
								onChange={(e) => setModel(e.target.value)}
							>
								{qwenModelOptions.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</div>
					</>
				);
			default:
				return null;
		}
	};

	return (
		<div style={styles.container}>
			<h2 style={styles.title}>AI 补全设置</h2>

			<div style={styles.switchContainer}>
				<div style={styles.switch}>
					<input
						type="checkbox"
						style={styles.switchInput}
						checked={isEnabled}
						onChange={() => setIsEnabled(!isEnabled)}
						id="enableAICompletion"
					/>
					<span
						style={{
							...styles.switchSlider,
							...(isEnabled ? styles.switchSliderChecked : {})
						}}
						onClick={() => setIsEnabled(!isEnabled)}
					>
						<span
							style={{
								...styles.switchSliderBefore,
								...(isEnabled ? styles.switchSliderBeforeChecked : {})
							}}
						/>
					</span>
				</div>
				<label htmlFor="enableAICompletion">启用 AI 补全</label>
			</div>

			<div style={styles.section}>
				<h3 style={styles.sectionTitle}>AI 模型设置</h3>
				<div style={styles.form}>
					<div style={styles.formGroup}>
						<label style={styles.label}>模型类型</label>
						<select
							style={styles.select}
							value={modelType}
							onChange={(e) => {
								const newModelType = e.target.value as AIModelType;
								setModelType(newModelType);
								setApiKey('');
								setEndpoint('');

								// 设置默认模型值
								switch (newModelType) {
									case AIModelType.DEEPSEEK:
										setModel('deepseek-coder');
										break;
									case AIModelType.QWEN:
										setModel('qwen-coder-turbo');
										break;

									default:
										setModel('');
								}
							}}
						>
							<option value={AIModelType.DEEPSEEK}>DeepSeek</option>
							<option value={AIModelType.QWEN}>通义千问</option>
						</select>
					</div>

					<div style={styles.formGroup}>
						<label style={styles.label}>API Key</label>
						<input
							type="password"
							style={styles.input}
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder="输入你的 API Key"
						/>
					</div>

					{renderModelTypeSpecificOptions()}

					<div style={styles.formGroup}>
						<label style={styles.label}>温度 (Temperature)</label>
						<input
							type="range"
							min="0"
							max="1"
							step="0.1"
							value={temperature}
							onChange={(e) => setTemperature(parseFloat(e.target.value))}
							style={{ width: '100%' }}
						/>
						<div style={styles.infoText}>{temperature} (较低的值生成更确定的结果)</div>
					</div>

					<div style={styles.formGroup}>
						<label style={styles.label}>最大 Token 数</label>
						<input
							type="number"
							style={styles.input}
							value={maxTokens}
							onChange={(e) => setMaxTokens(parseInt(e.target.value))}
							min="50"
						/>
					</div>

					<div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
						<button style={styles.button} onClick={saveConfig} disabled={!apiKey}>
							保存设置
						</button>
						<button
							style={{
								...styles.button,
								backgroundColor: '#009688',
								...(testStatus === 'testing' || !apiKey ? styles.buttonDisabled : {})
							}}
							onClick={testConnection}
							disabled={testStatus === 'testing' || !apiKey}
						>
							测试连接
						</button>
					</div>

					{testStatus === 'testing' && <div style={styles.infoText}>{testMessage}</div>}
					{testStatus === 'error' && <div style={styles.error}>{testMessage}</div>}
					{testStatus === 'success' && <div style={styles.success}>{testMessage}</div>}
				</div>
			</div>

			<div style={styles.section}>
				<h3 style={styles.sectionTitle}>关于 AI 补全</h3>
				<p style={styles.infoText}>
					启用 AI 补全后，编辑器将使用人工智能技术提供更智能的 SQL 补全建议。 你需要提供自己的 API
					Key 以连接 AI 服务。所有凭证仅存储在本地浏览器中， 不会上传到任何服务器。
				</p>
			</div>
		</div>
	);
};

export default AICompletionPanel;
