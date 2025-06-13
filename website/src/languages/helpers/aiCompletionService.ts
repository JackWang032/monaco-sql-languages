import { createRoot } from 'react-dom/client';
import {
	CancellationToken,
	editor,
	languages,
	IRange
} from 'monaco-editor/esm/vs/editor/editor.api';
import OpenAI from 'openai';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import CodeGenerationWidget from '../../extensions/workbench/codeGenerationWidget';

/**
 * AI模型服务类型
 */
export enum AIModelType {
	DEEPSEEK = 'deepseek',
	QWEN = 'qwen'
}

/**
 * AI模型配置
 */
export interface AIModelConfig {
	type: AIModelType;
	apiKey: string;
	model?: string; // 使用的模型名称
	endpoint?: string; // 自定义端点URL
	temperature?: number; // 随机性
	maxTokens?: number; // 最大生成token数
}

/**
 * 创建OpenAI兼容的客户端
 * @param config AI模型配置
 * @returns OpenAI客户端实例
 */
const createOpenAIClient = (config: AIModelConfig): OpenAI => {
	switch (config.type) {
		case AIModelType.DEEPSEEK:
			return new OpenAI({
				dangerouslyAllowBrowser: true,
				apiKey: config.apiKey,
				baseURL: config.endpoint || 'https://api.deepseek.com/beta'
			});
		case AIModelType.QWEN:
			return new OpenAI({
				dangerouslyAllowBrowser: true,
				apiKey: config.apiKey,
				baseURL: config.endpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
			});
		default:
			throw new Error(`不支持的AI模型类型: ${config.type}`);
	}
};

/**
 * AI补全配置存储
 */
class AICompletionConfigManager {
	private static instance: AICompletionConfigManager;
	private config: AIModelConfig | null = null;
	private isEnabled: boolean = false;
	private cache: Record<string, { timestamp: number; result: languages.InlineCompletion[] }> = {};
	private cacheExpiration: number = 60000; // 缓存过期时间，默认60秒
	private debounceTimeout: number | null = null;
	private debounceDelay: number = 400; // 增加延迟时间
	private pendingRequestCount: number = 0; // 请求计数器

	private constructor() {}

	public static getInstance(): AICompletionConfigManager {
		if (!AICompletionConfigManager.instance) {
			AICompletionConfigManager.instance = new AICompletionConfigManager();
		}
		return AICompletionConfigManager.instance;
	}

	public getConfig(): AIModelConfig | null {
		return this.config;
	}

	public setConfig(config: AIModelConfig): void {
		this.config = config;
	}

	public getEnabled(): boolean {
		return this.isEnabled;
	}

	public setEnabled(enabled: boolean): void {
		this.isEnabled = enabled;
	}

	/**
	 * 设置防抖延迟时间
	 * @param delay 延迟时间（毫秒）
	 */
	public setDebounceDelay(delay: number): void {
		this.debounceDelay = delay;
	}

	/**
	 * 使用防抖执行函数
	 * @param fn 要执行的函数
	 * @returns 如果函数被安排执行，返回true；如果被防抖取消，返回false
	 */
	public debounce<T extends any[]>(fn: (...args: T) => void, ...args: T): boolean {
		// 清除之前的防抖定时器
		if (this.debounceTimeout !== null) {
			clearTimeout(this.debounceTimeout);
			this.debounceTimeout = null;
		}

		// 检查是否已有请求正在处理，如果有则增加计数器
		this.pendingRequestCount++;
		const currentRequestId = this.pendingRequestCount;

		// 设置新的防抖定时器
		this.debounceTimeout = window.setTimeout(() => {
			// 只有当当前请求是最后一个请求时才执行
			if (currentRequestId === this.pendingRequestCount) {
				fn(...args);
				this.pendingRequestCount = 0; // 重置计数器
			} else {
				console.log(
					`跳过请求 #${currentRequestId}，因为有更新的请求 #${this.pendingRequestCount}`
				);
			}
			this.debounceTimeout = null;
		}, this.debounceDelay);

		return true;
	}

	/**
	 * 缓存请求结果
	 * @param key 缓存键
	 * @param result 请求结果
	 */
	public cacheResult(key: string, result: languages.InlineCompletion[]): void {
		this.cache[key] = {
			timestamp: Date.now(),
			result: [...result]
		};
	}

	/**
	 * 获取缓存的请求结果
	 * @param key 缓存键
	 * @returns 如果存在有效缓存，返回缓存结果；否则返回null
	 */
	public getCachedResult(key: string): languages.InlineCompletion[] | null {
		const cached = this.cache[key];
		if (cached && Date.now() - cached.timestamp < this.cacheExpiration) {
			return [...cached.result];
		}
		return null;
	}

	/**
	 * 清除所有缓存
	 */
	public clearCache(): void {
		this.cache = {};
	}

	/**
	 * 从本地存储加载配置
	 */
	public loadConfig(): void {
		try {
			const savedConfig = localStorage.getItem('aiCompletionConfig');
			if (savedConfig) {
				this.config = JSON.parse(savedConfig);
			}

			const enabledState = localStorage.getItem('aiCompletionEnabled');
			this.isEnabled = enabledState ? enabledState === 'true' : false;
		} catch (e) {
			console.error('加载AI补全配置失败', e);
		}
	}

	/**
	 * 保存配置到本地存储
	 */
	public saveConfig(): void {
		try {
			if (this.config) {
				localStorage.setItem('aiCompletionConfig', JSON.stringify(this.config));
			}
			localStorage.setItem('aiCompletionEnabled', String(this.isEnabled));
		} catch (e) {
			console.error('保存AI补全配置失败', e);
		}
	}
}

/**
 * 获取AI补全配置管理器实例
 */
export const getAICompletionConfigManager = (): AICompletionConfigManager => {
	return AICompletionConfigManager.getInstance();
};

/**
 * 发送请求到DeepSeek API（使用FIM填充中间模式）
 * @param prompt 提示文本
 * @param suffix 后缀文本
 * @param config AI模型配置
 * @param signal AbortController的signal，用于取消请求
 * @returns AI补全响应数组
 */
export const callDeepSeek = async (
	prompt: string,
	suffix: string,
	config: AIModelConfig,
	signal?: AbortSignal
): Promise<string[]> => {
	if (!config.apiKey) {
		throw new Error('未配置DeepSeek API Key');
	}

	const openai = createOpenAIClient(config);

	// 使用Fill-in-the-Middle (FIM) 模式
	const response = await openai.completions.create(
		{
			model: config.model || 'deepseek-coder',
			temperature: config.temperature,
			max_tokens: config.maxTokens,
			prompt,
			suffix
		},
		{ signal }
	);

	// 提取生成的内容
	return response.choices.map((choice) => choice.text || '');
};

/**
 * 发送请求到通义千问Coder API
 * @param prompt 提示文本
 * @param config AI模型配置
 * @param signal AbortController的signal，用于取消请求
 * @returns AI补全响应数组
 */
export const callQwen = async (
	prompt: string,
	config: AIModelConfig,
	signal?: AbortSignal
): Promise<string[]> => {
	if (!config.apiKey) {
		throw new Error('未配置通义千问 API Key');
	}

	const openai = createOpenAIClient(config);

	const response = await openai.completions.create(
		{
			model: config.model || 'qwen-coder-turbo', // 默认使用通义千问Code模型
			temperature: config.temperature,
			max_tokens: config.maxTokens,
			prompt
		},
		{ signal }
	);

	// 提取生成的内容
	return response.choices.map((choice) => choice.text || '');
};

/**
 * 代码生成Widget的状态
 */
export interface CodeGenerationWidgetState {
	// 是否可见
	isVisible: boolean;
	// 编辑器位置（行号和列号）
	position: { lineNumber: number; column: number } | null;
	// 选中的代码范围（用于替换）
	selectionRange: IRange | null;
	// 用户输入的提示文本
	prompt: string;
	// 是否正在生成代码
	isGenerating: boolean;
	// 生成的代码
	generatedCode: string | null;
}

// 注册快捷键处理的标志，确保只注册一次
let keyBindingRegistered = false;

// 导入React和ReactDOM
import React from 'react';
import ReactDOM from 'react-dom';

// OverlayWidget实例
let codeGenerationOverlayWidget: CodeGenerationOverlayWidget | null = null;

/**
 * 代码生成OverlayWidget实现
 */
class CodeGenerationOverlayWidget implements editor.IOverlayWidget {
	private readonly _id: string = 'code-generation-overlay-widget';
	private readonly _domNode: HTMLElement;
	private readonly _editor: editor.IStandaloneCodeEditor;
	private _position: monaco.Position | null = null;
	private _selectionRange: monaco.Range | null = null;

	constructor(editorInstance: editor.IStandaloneCodeEditor) {
		this._editor = editorInstance;

		// 创建DOM节点并设置基本样式
		this._domNode = document.createElement('div');
		this._domNode.className = 'code-generation-overlay';
		this._domNode.style.zIndex = '1000';

		// 添加入场动画的初始状态
		this._domNode.style.opacity = '0';
		this._domNode.style.transform = 'translateY(-10px)';

		// 确保全局样式已添加
		this.ensureGlobalStyles();

		// 通过setTimeout来确保CSS过渡动画能够生效
		setTimeout(() => {
			this._domNode.style.opacity = '1';
			this._domNode.style.transform = 'translateY(0)';
		}, 10);
	}

	getId(): string {
		return this._id;
	}

	getDomNode(): HTMLElement {
		return this._domNode;
	}

	setPosition(position: monaco.Position, selectionRange: monaco.Range | null = null): void {
		this._position = position;
		this._selectionRange = selectionRange;

		// 通知编辑器更新覆盖小部件的位置
		if (this._editor) {
			this._editor.layoutOverlayWidget(this);
		}
	}

	getPosition(): editor.IOverlayWidgetPosition | null {
		if (!this._position) return null;

		// 获取编辑器可视区域信息
		const visibleRanges = this._editor.getVisibleRanges();
		const cursorTop = this._editor.getTopForPosition(
			this._position.lineNumber,
			this._position.column
		);
		const viewportHeight = this._editor.getLayoutInfo().height;
		const viewportOffset = this._editor.getScrollTop();

		// 判断光标位置在视口的上半部分还是下半部分
		const cursorRelativePos = cursorTop - viewportOffset;
		const isInUpperHalf = cursorRelativePos < viewportHeight / 2;

		// 根据光标位置决定小部件的位置偏好
		if (isInUpperHalf) {
			// 光标在上半部分，小部件显示在下面
			return {
				preference: monaco.editor.OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
			};
		} else {
			// 光标在下半部分，小部件显示在上面
			return {
				preference: monaco.editor.OverlayWidgetPositionPreference.TOP_CENTER
			};
		}
	}

	// 渲染React组件
	renderContent(): void {
		if (!this._position) return;

		// 添加动画效果的类
		this._domNode.className = 'code-generation-overlay';

		// 智能计算小部件的尺寸
		const editorInfo = this._editor.getLayoutInfo();
		const editorWidth = editorInfo.width;
		const editorHeight = editorInfo.height;

		// 计算最佳宽度：小屏幕上最多使用编辑器宽度的80%，大屏幕上限制在380px
		const isSmallScreen = editorWidth < 600;
		const maxWidth = isSmallScreen ? editorWidth * 0.8 : Math.min(600, editorWidth * 0.45);

		this._domNode.style.maxWidth = `${maxWidth}px`;
		this._domNode.style.width = `${maxWidth}px`;

		this._domNode.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.25)';
		this._domNode.style.borderRadius = '4px';

		const root = createRoot(this._domNode);
		root.render(
			React.createElement(CodeGenerationWidget, {
				editorInstance: this._editor,
				initialPosition: this._position,
				initialSelection: this._selectionRange,
				widgetWidth: maxWidth,
				onClose: () => {
					this.dispose();
				}
			})
		);

		// 使用setTimeout确保渲染完成后再开始动画
		setTimeout(() => {
			this._domNode.classList.add('animated');
		}, 10);
	}

	// 销毁Widget
	// 确保全局CSS样式已添加
	private ensureGlobalStyles(): void {
		let styleElem = document.getElementById('code-generation-styles');
		if (styleElem) return; // 样式已存在，无需再次添加

		styleElem = document.createElement('style');
		styleElem.id = 'code-generation-styles';
		styleElem.textContent = `
			.code-generation-overlay-widget {
				z-index: 100000;
			}

			.code-generation-overlay {
				transition: opacity 0.2s ease, transform 0.2s ease;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
				border-radius: 4px;
				overflow: hidden;
				pointer-events: auto;
				opacity: 0;
				transform: translateY(-10px);
			}

			/* 动画效果类 */
			.code-generation-overlay.animated {
				opacity: 1;
				transform: translateY(0);
			}

			/* 编辑器暗色主题样式 */
			body.vs-dark .code-generation-overlay button:hover {
				background-color: #1177bb;
			}

			body.vs-dark .code-generation-overlay button.cancel:hover {
				background-color: #4c4c4c;
			}

			/* 鼠标悬停效果 */
			.code-generation-overlay .icon-button:hover {
				background-color: rgba(255, 255, 255, 0.1);
			}

			/* 输入框样式 */
			.code-generation-overlay textarea:focus {
				outline: none;
				border-color: #007acc;
			}

			/* 确保文本在暗色主题中清晰可见 */
			body.vs-dark .code-generation-overlay {
				color: #ffffff;
				background-color: #252526;
			}

			body.vs-dark .code-generation-overlay textarea {
				background-color: #1e1e1e;
				color: #ffffff;
				border-color: #3c3c3c;
			}
		`;
		document.head.appendChild(styleElem);
	}

	dispose(): void {
		// 移除animated类以触发淡出动画
		this._domNode.classList.remove('animated');

		// 确保还原初始状态
		this._domNode.style.opacity = '0';
		this._domNode.style.transform = 'translateY(-10px)';

		// 等待动画完成后再彻底移除
		setTimeout(() => {
			// 卸载React组件
			ReactDOM.unmountComponentAtNode(this._domNode);

			// 从编辑器中移除Widget
			if (this._editor && codeGenerationOverlayWidget === this) {
				this._editor.removeOverlayWidget(this);
				codeGenerationOverlayWidget = null;
			}

			// 清理任何浮动状态
			this._position = null;
			this._selectionRange = null;
		}, 200); // 200ms与CSS过渡动画时间匹配
	}
}

/**
 * 注册快捷键处理
 * @param editorInstance 编辑器实例
 */
export const registerCodeGenerationKeyBinding = (
	editorInstance: editor.IStandaloneCodeEditor
): void => {
	if (keyBindingRegistered) return;

	const KeyMod = monaco.KeyMod;
	const KeyCode = monaco.KeyCode;

	// 使用事件监听代替addCommand，避免KeybindingService问题
	editorInstance.onKeyDown((e) => {
		// Ctrl+Enter 或 Cmd+Enter
		if ((e.ctrlKey || e.metaKey) && e.keyCode === KeyCode.Enter) {
			const selection = editorInstance.getSelection();
			const position = selection ? selection.getPosition() : editorInstance.getPosition();

			if (!position) return;

			// 如果有选择范围，则将其传递给widget供后续替换使用
			const selectionRange = selection && !selection.isEmpty() ? selection : null;

			// 如果已经有widget，先删除
			if (codeGenerationOverlayWidget) {
				codeGenerationOverlayWidget.dispose();
				codeGenerationOverlayWidget = null;
			}

			// 创建新的OverlayWidget
			codeGenerationOverlayWidget = new CodeGenerationOverlayWidget(editorInstance);

			// 设置位置和选择范围
			codeGenerationOverlayWidget.setPosition(position, selectionRange);

			// 添加到编辑器
			editorInstance.addOverlayWidget(codeGenerationOverlayWidget);

			// 渲染内容
			codeGenerationOverlayWidget.renderContent();
		}
	});

	keyBindingRegistered = true;
};

let abortController: AbortController | null = null;

/**
 * 根据类型调用对应的AI API
 * @param languageId 语言类型
 * @param code 当前代码
 * @param offset 光标位置
 * @param config AI模型配置
 * @param signal AbortController的signal，用于取消请求
 * @returns AI补全响应
 */
export const callAIAPI = async (
	languageId: string,
	code: string,
	offset: number,
	config: AIModelConfig,
	requestId: string,
	token?: CancellationToken
): Promise<string[]> => {
	try {
		// 放弃之前的请求
		if (abortController) {
			abortController.abort();
			abortController = null;
		}

		// 如果已经请求取消，直接返回
		if (token?.isCancellationRequested) {
			return [];
		}

		// 创建一个新的 AbortController
		abortController = new AbortController();
		const signal = abortController.signal;

		// 注册取消事件
		token?.onCancellationRequested(() => {
			if (abortController) {
				abortController.abort();
			}
		});

		console.log(`[${requestId}] AI请求中...`);
		let start = Date.now();

		let result: string[] = [];

		switch (config.type) {
			case AIModelType.DEEPSEEK: {
				const promptParams = buildPrompt(AIModelType.DEEPSEEK, languageId, code, offset);
				// 调用DeepSeek的FIM接口
				result = await callDeepSeek(
					promptParams.prompt!,
					promptParams.suffix!,
					config,
					signal
				);
				break;
			}
			case AIModelType.QWEN: {
				const promptParams = buildPrompt(AIModelType.QWEN, languageId, code, offset);
				// 调用通义千问的FIM接口
				result = await callQwen(promptParams.prompt!, config, signal);
				break;
			}
			default:
				throw new Error(`不支持的AI模型类型: ${config.type}`);
		}
		const costs = Date.now() - start;
		console.log(`[${requestId}] AI请求完成[${costs}ms]`);
		return result;
	} catch (error: any) {
		if (typeof error === 'object' && error.toString().includes('Abort')) {
			console.log(`[${requestId}] 请求已取消`);
		}
		return [];
	}
};

export const getPositionAtOffset = (offset: number, code: string) => {
	const prefix = code.substring(0, offset);
	const lines = prefix.split('\n');
	const currentLine = lines.length;
	// 计算光标在当前行的列位置
	const cursorPositionInLine = lines[lines.length - 1].length + 1;
	return {
		line: currentLine,
		column: cursorPositionInLine
	};
};

/**
 * 构建AI提示
 * @param languageId 语言类型
 * @param code 当前代码
 * @param offset 光标位置
 * @returns 提示文本
 */
const buildPrompt = (
	model: AIModelType,
	languageId: string,
	code: string,
	offset: number
): { prompt?: string; suffix?: string } => {
	// 智能缩减上下文，提取语义完整的代码块
	// const extractContextualCode = (fullCode: string, cursorOffset: number) => {
	// 	// 分割代码行
	// 	const lines = fullCode.split('\n');
	// 	let lineIndex = 0;
	// 	let currentPos = 0;

	// 	// 找到光标所在行
	// 	for (let i = 0; i < lines.length; i++) {
	// 		const lineLength = lines[i].length + 1; // +1 是换行符
	// 		if (currentPos + lineLength > cursorOffset) {
	// 			lineIndex = i;
	// 			break;
	// 		}
	// 		currentPos += lineLength;
	// 	}

	// 	// 找到光标所在的语义块 (假设{}、SELECT/FROM等可以作为SQL语句块的标记)
	// 	// 1. 提取光标周围一定范围的行
	// 	const contextWindow = 15; // 提取前后15行作为初始上下文窗口
	// 	const startLine = Math.max(0, lineIndex - contextWindow);
	// 	const endLine = Math.min(lines.length - 1, lineIndex + contextWindow);

	// 	// 2. 检查这些行，确保语法完整性
	// 	const contextLines = lines.slice(startLine, endLine + 1);
	// 	const contextCode = contextLines.join('\n');

	// 	// 3. 计算前缀和后缀
	// 	const prefixEndPos =
	// 		cursorOffset - currentPos + lines[lineIndex].substring(0, cursorOffset - currentPos).length;
	// 	const prefix = contextCode.substring(0, prefixEndPos);
	// 	const suffix = contextCode.substring(prefixEndPos);

	// 	return { prefix, suffix };
	// };

	// const { prefix, suffix } = extractContextualCode(code, offset);

	const prefix = code.substring(0, offset);
	const suffix = code.substring(offset);
	const basePrompt = `
# 你是个SQL专家，针对 ${languageId} SQL语言进行Fill In Middle补全
# 必须遵守以下规则：
- 只生成一条语句, 如只包含单条CREATE TABLE语句
- 不要包含占位符, 如'?'
# 这是需要你补全的内容:
`;

	switch (model) {
		case AIModelType.DEEPSEEK:
			return {
				prompt: `${basePrompt} ${prefix}`,
				suffix: suffix
			};
		case AIModelType.QWEN:
			return {
				prompt: basePrompt + `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`
			};
		default:
			return {};
	}
};

/**
 * 从AI补全结果解析出补全项
 * @param aiResponse AI模型的响应
 */
const parseAICompletions = (aiResponses: string[]): string[] => {
	if (!aiResponses?.length) return [];

	const cleanResponse = aiResponses
		.map((line) => {
			const formatLine = line.replace(/```sql/g, '').replace(/```/g, '');
			return formatLine === '\n' ? '' : formatLine;
		})
		.filter(Boolean);

	return cleanResponse;
};

/**
 * 获取AI补全建议
 * @param languageId 语言ID
 * @param code 当前代码
 * @param offset 光标位置
 * @param token 取消令牌
 * @returns 补全项数组
 */
/**
 * 使用AI生成代码
 * @param languageId 语言ID
 * @param prompt 提示文本
 * @param existingCode 现有代码（可选，用于上下文）
 * @param token 取消令牌
 * @returns 生成的代码
 */
export const generateCodeWithAI = async (
	languageId: string,
	prompt: string,
	existingCode?: string,
	token?: CancellationToken
): Promise<string | null> => {
	const configManager = getAICompletionConfigManager();

	// 检查AI是否启用
	if (!configManager.getEnabled()) {
		console.warn('AI代码生成未启用');
		return null;
	}

	// 获取配置
	const config = configManager.getConfig();
	if (!config || !config.apiKey) {
		console.warn('AI代码生成未配置API Key');
		return null;
	}

	// 放弃之前的请求
	if (abortController) {
		abortController.abort();
		abortController = null;
	}

	// 如果已经请求取消，直接返回
	if (token?.isCancellationRequested) {
		return null;
	}

	// 创建一个新的 AbortController
	abortController = new AbortController();
	const signal = abortController.signal;

	// 注册取消事件
	let disposable: { dispose: () => void } | undefined;
	if (token) {
		disposable = token.onCancellationRequested(() => {
			if (abortController) {
				abortController.abort();
			}
		});
	}

	try {
		const requestId = Math.random().toString(36).substring(2, 8);
		console.log(`[${requestId}] AI代码生成请求中...`);
		const start = Date.now();

		let fullPrompt = '';
		if (existingCode) {
			// 如果有现有代码，将其作为上下文
			fullPrompt = `
当前代码:
\`\`\`${languageId}
${existingCode}
\`\`\`

${prompt}

请只生成代码，不要有额外解释。如果是SQL请确保语法正确。
`;
		} else {
			// 无现有代码，直接使用提示
			fullPrompt = `${prompt}\n\n请只生成代码，不要有额外解释。如果是SQL请确保语法正确。`;
		}

		let result: string[] = [];

		switch (config.type) {
			case AIModelType.DEEPSEEK: {
				// 在代码生成模式下，不使用FIM，而是直接输入提示
				const openai = createOpenAIClient(config);
				const response = await openai.completions.create(
					{
						model: config.model || 'deepseek-coder',
						temperature: config.temperature,
						max_tokens: config.maxTokens || 1024,
						prompt: fullPrompt
					},
					{ signal }
				);
				result = response.choices.map((choice) => choice.text || '');
				break;
			}
			case AIModelType.QWEN: {
				// 通义千问直接使用完整提示
				const openai = createOpenAIClient(config);
				const response = await openai.completions.create(
					{
						model: config.model || 'qwen-coder-turbo',
						temperature: config.temperature,
						max_tokens: config.maxTokens || 1024,
						prompt: fullPrompt
					},
					{ signal }
				);
				result = response.choices.map((choice) => choice.text || '');
				break;
			}
			default:
				throw new Error(`不支持的AI模型类型: ${config.type}`);
		}

		const costs = Date.now() - start;
		console.log(`[${requestId}] AI代码生成完成[${costs}ms]`);

		// 清理取消事件监听器
		if (disposable) {
			disposable.dispose();
		}

		if (!result.length) return null;

		// 处理结果，移除可能的代码块标记
		let generatedCode = result[0];
		generatedCode = generatedCode.replace(/```(\w*\n)?/g, '').replace(/```/g, '');
		return generatedCode.trim();
	} catch (error: any) {
		console.error('AI代码生成失败:', error);
		if (disposable) {
			disposable.dispose();
		}
		if (typeof error === 'object' && error.toString().includes('Abort')) {
			console.log('代码生成请求已取消');
		}
		return null;
	}
};

export const getAICompletions = async (
	languageId: string,
	code: string,
	offset: number,
	token?: CancellationToken
): Promise<languages.InlineCompletion[]> => {
	const configManager = getAICompletionConfigManager();

	// 检查AI补全是否启用
	if (!configManager.getEnabled()) {
		return [];
	}

	// 获取配置
	const config = configManager.getConfig();
	if (!config || !config.apiKey) {
		console.warn('AI补全未配置API Key');
		return [];
	}

	// 生成缓存键
	// 提取光标位置上下文 - 智能提取当前代码块的内容
	const extractContext = () => {
		// 找到光标所在的代码块
		const lines = code.split('\n');
		let lineIndex = 0;
		let currentPos = 0;

		// 找到光标所在行
		for (let i = 0; i < lines.length; i++) {
			const lineLength = lines[i].length + 1; // +1 是换行符
			if (currentPos + lineLength > offset) {
				lineIndex = i;
				break;
			}
			currentPos += lineLength;
		}

		// 提取光标所在的代码块 (前后最多10行)
		const startLine = Math.max(0, lineIndex - 10);
		const endLine = Math.min(lines.length - 1, lineIndex + 10);
		const relevantLines = lines.slice(startLine, endLine + 1);

		// 在代码块中找到语义相关的部分（如函数、SQL语句块等）
		const contextBlock = relevantLines.join('\n');

		// 如果代码块太大，只保留光标前后各200个字符
		if (contextBlock.length > 400) {
			const cursorPosInBlock = offset - currentPos + lines[lineIndex].length;
			const blockStart = Math.max(0, cursorPosInBlock - 200);
			const blockEnd = Math.min(contextBlock.length, cursorPosInBlock + 200);
			return contextBlock.substring(blockStart, blockEnd);
		}

		return contextBlock;
	};

	const codeContext = extractContext();

	// 通过只保留关键信息来生成更通用的缓存键
	// 1. 删除多余空格
	const normalizedContext = codeContext.replace(/\s+/g, ' ').trim();
	// 2. 使用上下文哈希作为键的一部分
	const contextHash = hashString(normalizedContext);
	const cacheKey = `${languageId}:${contextHash}`;

	// 辅助函数：简单的字符串哈希算法
	function hashString(str: string): string {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = (hash << 5) - hash + char;
			hash = hash & hash; // Convert to 32bit integer
		}
		return hash.toString(16);
	}

	// 检查缓存
	const cachedResult = configManager.getCachedResult(cacheKey);
	if (cachedResult) {
		//	console.log('使用缓存的AI补全结果');
		//	return cachedResult;
	}

	// 使用防抖处理请求
	return new Promise((resolve) => {
		const sendRequest = async () => {
			// 检查是否已取消
			if (token?.isCancellationRequested) {
				resolve([]);
				return;
			}

			// 添加请求ID用于追踪
			const requestId = Math.random().toString(36).substring(2, 8);

			// 注册取消事件
			const disposable = token?.onCancellationRequested(() => {
				if (abortController) {
					abortController.abort();
					abortController = null;
				}
				resolve([]);
			});

			// 请求AI补全
			const aiResponses = await callAIAPI(languageId, code, offset, config, requestId, token);

			if (!aiResponses || aiResponses.length === 0) {
				resolve([]);
				return;
			}

			const completions: string[] = parseAICompletions(aiResponses as any);

			console.log(`[${requestId}] 解析后的补全建议:`, completions);

			if (completions.length === 0) {
				resolve([]);
				return;
			}

			const completionItems: languages.InlineCompletion[] = completions.map((completion) => ({
				text: completion
			}));

			// 缓存结果
			configManager.cacheResult(cacheKey, completionItems);

			// 清理取消事件监听器
			if (disposable) {
				disposable.dispose();
			}

			resolve(completionItems);
		};

		// 应用防抖，等待用户停止输入一段时间后才发送请求
		const debounced = configManager.debounce(sendRequest);
		if (!debounced) {
			resolve([]);
		}
	});
};
