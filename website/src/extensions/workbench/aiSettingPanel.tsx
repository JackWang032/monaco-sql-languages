import React, { useEffect, useState } from 'react';
import { getAIConfigManager } from '../../ai/config';
import { AIModelConfig, AIModelType } from '../../ai/types';
import OpenAI from 'openai';
import './aiSettingPanel.css';

const AISettingPanel: React.FC = () => {
	const configManager = getAIConfigManager();
	const [isEnabled, setIsEnabled] = useState(false);
	const [modelType, setModelType] = useState<AIModelType>(AIModelType.QWEN);
	const [apiKey, setApiKey] = useState('');
	const [model, setModel] = useState('qwen-coder-turbo');
	const [endpoint, setEndpoint] = useState('');
	const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
	const [testMessage, setTestMessage] = useState('');

	// 初始化时从配置管理器加载配置
	useEffect(() => {
		// 在应用启动时已经加载了配置，这里只需要获取配置并更新UI
		const config = configManager.getConfig();
		if (config) {
			setModelType(config.type);
			setApiKey(config.apiKey);
			setModel(config.model);
			setEndpoint(config.endpoint);
		}

		setIsEnabled(configManager.getEnabled());
	}, []);

	// 保存配置
	const saveConfig = () => {
		const config: AIModelConfig = {
			type: modelType,
			apiKey,
			model,
			endpoint
		};

		configManager.setConfig(config);
		configManager.setEnabled(isEnabled);
		configManager.saveConfig();

		setTestStatus('success');
		setTestMessage('配置已保存');

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
			const openai = new OpenAI({
				dangerouslyAllowBrowser: true,
				apiKey,
				baseURL: endpoint
			});
			const result = await openai.chat.completions.create({
				model,
				messages: [
					{ role: 'system', content: 'You are a helpful assistant.' },
					{ role: 'user', content: '你是谁？' }
				]
			});

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
		}
	};

	const renderModelOptions = () => {
		switch (modelType) {
			case AIModelType.DEEPSEEK:
				return (
					<>
						<div className="ai-setting-panel__form-group">
							<label className="ai-setting-panel__label">DeepSeek API 端点</label>
							<input
								type="text"
								className="ai-setting-panel__input"
								value={endpoint}
								onChange={(e) => setEndpoint(e.target.value)}
							/>
						</div>
						<div className="ai-setting-panel__form-group">
							<label className="ai-setting-panel__label">模型</label>
							<select
								className="ai-setting-panel__select"
								value={model}
								onChange={(e) => setModel(e.target.value)}
							>
								<option value="deepseek-chat">deepseek-chat(r1)</option>
								<option value="deepseek-coder">deepseek-coder(v3)</option>
							</select>
						</div>
					</>
				);
			case AIModelType.QWEN:
				const qwenModelOptions = [
					'qwen-coder-turbo',
					'qwen-coder-plus',
					'qwen2.5-coder-32b-instruct',
					'qwen2.5-coder-3b-instruct'
				];
				return (
					<>
						<div className="ai-setting-panel__form-group">
							<label className="ai-setting-panel__label">通义千问 API 端点</label>
							<input
								type="text"
								className="ai-setting-panel__input"
								value={endpoint}
								onChange={(e) => setEndpoint(e.target.value)}
							/>
						</div>
						<div className="ai-setting-panel__form-group">
							<label className="ai-setting-panel__label">QWEN 模型</label>
							<select
								className="ai-setting-panel__select"
								value={model}
								onChange={(e) => {
									setModel(e.target.value);
								}}
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
		<div className="ai-setting-panel">
			<h2 className="ai-setting-panel__title">AI 设置</h2>
			<div className="ai-setting-panel__switch-container">
				<div className="ai-setting-panel__switch">
					<input
						type="checkbox"
						className="ai-setting-panel__switch-input"
						checked={isEnabled}
						onChange={() => setIsEnabled(!isEnabled)}
						id="enableAICompletion"
					/>
					<span
						className={`ai-setting-panel__switch-slider ${isEnabled ? 'ai-setting-panel__switch-slider--checked' : ''}`}
						onClick={() => setIsEnabled(!isEnabled)}
					>
						<span />
					</span>
				</div>
				<label htmlFor="enableAICompletion">启用 AI 特性</label>
			</div>

			<div className="ai-setting-panel__section">
				<h3 className="ai-setting-panel__section-title">AI 模型设置</h3>
				<div className="ai-setting-panel__form">
					<div className="ai-setting-panel__form-group">
						<label className="ai-setting-panel__label">模型类型</label>
						<select
							className="ai-setting-panel__select"
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
										setEndpoint('https://api.deepseek.com/beta');
										break;
									case AIModelType.QWEN:
										setModel('qwen-coder-turbo');
										setEndpoint(
											'https://dashscope.aliyuncs.com/compatible-mode/v1'
										);
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

					<div className="ai-setting-panel__form-group">
						<label className="ai-setting-panel__label">API Key</label>
						<input
							type="password"
							className="ai-setting-panel__input"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder="输入你的 API Key"
						/>
					</div>

					{renderModelOptions()}

					<div className="ai-setting-panel__button-group">
						<button
							className="ai-setting-panel__button"
							onClick={saveConfig}
							disabled={!apiKey}
						>
							保存设置
						</button>
						<button
							className={`ai-setting-panel__button ai-setting-panel__button--test ${testStatus === 'testing' || !apiKey ? '' : ''}`}
							onClick={testConnection}
							disabled={testStatus === 'testing' || !apiKey}
						>
							测试连接
						</button>
					</div>

					{testStatus === 'testing' && (
						<div className="ai-setting-panel__info-text">{testMessage}</div>
					)}
					{testStatus === 'error' && (
						<div className="ai-setting-panel__error">{testMessage}</div>
					)}
					{testStatus === 'success' && (
						<div className="ai-setting-panel__success">{testMessage}</div>
					)}
				</div>
			</div>

			<div className="ai-setting-panel__section">
				<h3 className="ai-setting-panel__section-title">关于</h3>
				<p className="ai-setting-panel__info-text">
					启用 AI 功能后，编辑器将使用人工智能技术提供更智能的 SQL 补全建议。
					你需要提供自己的 API Key 以连接 AI 服务。所有凭证仅存储在本地浏览器中，
					不会上传到任何服务器。
				</p>
			</div>
		</div>
	);
};

export default AISettingPanel;
