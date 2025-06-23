import {
	CancellationToken,
	editor,
	languages,
	IRange
} from 'monaco-editor/esm/vs/editor/editor.api';
import OpenAI from 'openai';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { createCodeGenerationOverlayWidget } from '../../extensions/workbench/codeGenerationWidget';
import { PromptScenario, PromptContext, getPromptSystemManager } from './promptSystem';

/**
 * AI模型服务
 */
export enum AIModelType {
	DEEPSEEK = 'deepseek',
	QWEN = 'qwen'
}

/**
 * AI场景特定的API配置
 */
export interface ScenarioAPIConfig {
	/** 端点URL */
	endpoint?: string;
	/** 模型名称 */
	model?: string;
	/** 温度参数 */
	temperature?: number;
	/** 最大token数 */
	maxTokens?: number;
	/** 是否使用聊天模式 */
	useChatMode?: boolean;
}

/**
 * AI模型配置
 */
export interface AIModelConfig {
	type: AIModelType;
	apiKey: string;
	/** 默认配置 */
	defaultConfig?: {
		model?: string;
		endpoint?: string;
		temperature?: number;
		maxTokens?: number;
	};
	/** 不同场景的特定配置 */
	scenarioConfigs?: Partial<Record<PromptScenario, ScenarioAPIConfig>>;
}

/**
 * 创建OpenAI兼容的客户端
 * @param config AI模型配置
 * @param scenario 使用场景
 * @returns OpenAI客户端实例
 */
const createOpenAIClient = (config: AIModelConfig, scenario?: PromptScenario): OpenAI => {
	// 获取场景特定配置
	const scenarioConfig = scenario ? config.scenarioConfigs?.[scenario] : undefined;
	const endpoint = scenarioConfig?.endpoint || config.defaultConfig?.endpoint;

	switch (config.type) {
		case AIModelType.DEEPSEEK:
			return new OpenAI({
				dangerouslyAllowBrowser: true,
				apiKey: config.apiKey,
				baseURL: endpoint || 'https://api.deepseek.com/beta'
			});
		case AIModelType.QWEN:
			return new OpenAI({
				dangerouslyAllowBrowser: true,
				apiKey: config.apiKey,
				baseURL: endpoint || 'https://dashscope.aliyuncs.com/compatible-mode/v1'
			});
		default:
			throw new Error(`不支持的AI模型类型: ${config.type}`);
	}
};

/**
 * @param config AI模型配置
 * @param scenario 使用场景
 * @param templateParams 提示词模板参数
 * @returns 模型参数
 */
const getScenarioModelParams = (
	config: AIModelConfig,
	scenario: PromptScenario,
	templateParams?: { temperature?: number; maxTokens?: number }
) => {
	const scenarioConfig = config.scenarioConfigs?.[scenario];
	const defaultConfig = config.defaultConfig;

	const temperature =
		scenarioConfig?.temperature ??
		templateParams?.temperature ??
		defaultConfig?.temperature ??
		0.3;

	const maxTokens =
		scenarioConfig?.maxTokens ?? templateParams?.maxTokens ?? defaultConfig?.maxTokens ?? 512;

	const model =
		scenarioConfig?.model ??
		defaultConfig?.model ??
		(config.type === AIModelType.DEEPSEEK ? 'deepseek-coder' : 'qwen-coder-turbo');

	const useChatMode = scenarioConfig?.useChatMode ?? true;

	return { temperature, maxTokens, model, useChatMode };
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

	/**
	 * 设置场景特定配置
	 * @param scenario 场景
	 * @param config 配置
	 */
	public setScenarioConfig(scenario: PromptScenario, config: ScenarioAPIConfig): void {
		if (!this.config) {
			console.warn('请先设置基础配置');
			return;
		}

		if (!this.config.scenarioConfigs) {
			this.config.scenarioConfigs = {};
		}

		this.config.scenarioConfigs[scenario] = config;
		this.saveConfig();
	}

	/**
	 * 获取场景特定配置
	 * @param scenario 场景
	 * @returns 场景配置
	 */
	public getScenarioConfig(scenario: PromptScenario): ScenarioAPIConfig | undefined {
		return this.config?.scenarioConfigs?.[scenario];
	}

	/**
	 * 批量设置场景配置
	 * @param configs 场景配置映射
	 */
	public setScenarioConfigs(configs: Partial<Record<PromptScenario, ScenarioAPIConfig>>): void {
		if (!this.config) {
			console.warn('请先设置基础配置');
			return;
		}

		this.config.scenarioConfigs = { ...this.config.scenarioConfigs, ...configs };
		this.saveConfig();
	}

	/**
	 * 使用预设配置
	 * @param presetName 预设名称
	 */
	public usePreset(presetName: keyof typeof SCENARIO_API_PRESETS): void {
		const preset = SCENARIO_API_PRESETS[presetName];
		if (preset) {
			this.setScenarioConfigs(preset);
			console.log(`已应用预设配置: ${presetName}`);
		} else {
			console.warn(`未找到预设配置: ${presetName}`);
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
 * @param prompt 提示文本
 * @param suffix 后缀文本（FIM模式）
 * @param config AI模型配置
 * @param scenario 使用场景
 * @param signal AbortController的signal，用于取消请求
 * @param systemPrompt 系统提示词（Chat模式）
 * @returns AI补全响应数组
 */
export const callDeepSeek = async (
	prompt: string,
	suffix: string,
	config: AIModelConfig,
	scenario: PromptScenario = PromptScenario.SYNTAX_COMPLETION,
	signal?: AbortSignal,
	systemPrompt?: string
): Promise<string[]> => {
	if (!config.apiKey) {
		throw new Error('未配置DeepSeek API Key');
	}

	const openai = createOpenAIClient(config, scenario);
	const modelParams = getScenarioModelParams(config, scenario);

	// 根据场景决定使用FIM还是Chat模式
	if (modelParams.useChatMode && systemPrompt) {
		// Chat模式
		const response = await openai.chat.completions.create(
			{
				model: modelParams.model,
				temperature: modelParams.temperature,
				max_tokens: modelParams.maxTokens,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: prompt }
				]
			},
			{ signal }
		);
		return response.choices.map((choice) => choice.message?.content || '');
	} else {
		// FIM模式
		const response = await openai.completions.create(
			{
				model: modelParams.model,
				temperature: modelParams.temperature,
				max_tokens: modelParams.maxTokens,
				prompt,
				suffix
			},
			{ signal }
		);
		return response.choices.map((choice) => choice.text || '');
	}
};

/**
 * @param prompt 提示文本
 * @param config AI模型配置
 * @param scenario 使用场景
 * @param signal 用于取消请求
 * @param systemPrompt 系统提示词
 * @returns AI补全响应数组
 */
export const callQwen = async (
	prompt: string,
	config: AIModelConfig,
	scenario: PromptScenario = PromptScenario.SYNTAX_COMPLETION,
	signal?: AbortSignal,
	systemPrompt?: string
): Promise<string[]> => {
	if (!config.apiKey) {
		throw new Error('未配置通义千问 API Key');
	}

	const openai = createOpenAIClient(config, scenario);
	const modelParams = getScenarioModelParams(config, scenario);
	// 根据场景决定使用FIM还是Chat模式
	if (modelParams.useChatMode && systemPrompt) {
		// Chat模式
		const response = await openai.chat.completions.create(
			{
				model: modelParams.model,
				temperature: modelParams.temperature,
				max_tokens: modelParams.maxTokens,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: prompt }
				]
			},
			{ signal }
		);
		return response.choices.map((choice) => choice.message?.content || '');
	} else {
		// FIM模式
		const response = await openai.completions.create(
			{
				model: modelParams.model,
				temperature: modelParams.temperature,
				max_tokens: modelParams.maxTokens,
				prompt
			},
			{ signal }
		);
		return response.choices.map((choice) => choice.text || '');
	}
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

// 当前活动的viewZone实例
let activeCodeGenerationViewZone: { dispose: () => void } | null = null;

/**
 * 注册快捷键处理
 * @param editorInstance 编辑器实例
 */
export const registerCodeGenerationKeyBinding = (
	editorInstance: editor.IStandaloneCodeEditor
): void => {
	if (keyBindingRegistered) return;

	const KeyCode = monaco.KeyCode;

	editorInstance.onKeyDown((e) => {
		if ((e.ctrlKey || e.metaKey) && e.keyCode === KeyCode.KeyK) {
			e.preventDefault();
			e.stopPropagation();

			const selection = editorInstance.getSelection();
			const position = selection ? selection.getPosition() : editorInstance.getPosition();

			if (!position) return;

			// 如果有选择范围，则将其传递给widget供后续替换使用
			const selectionRange = selection && !selection.isEmpty() ? selection : null;

			// 如果已经有viewZone，先清理
			if (activeCodeGenerationViewZone) {
				activeCodeGenerationViewZone.dispose();
				activeCodeGenerationViewZone = null;
			}

			// 创建新的ViewZone
			activeCodeGenerationViewZone = createCodeGenerationOverlayWidget(
				editorInstance,
				position,
				selectionRange,
				undefined, // widgetWidth
				() => {
					// 当viewZone被dispose时清理全局状态
					activeCodeGenerationViewZone = null;
				}
			);
		}
	});

	keyBindingRegistered = true;
};

let abortController: AbortController | null = null;

/**
 * @param scenario 场景类型
 * @param context 提示词上下文
 * @param config AI模型配置
 * @param requestId 请求ID
 * @param token 取消令牌
 * @returns AI补全响应
 */
export const callAIService = async (
	scenario: PromptScenario,
	context: PromptContext,
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

		if (token?.isCancellationRequested) {
			return [];
		}

		abortController = new AbortController();
		const signal = abortController.signal;

		token?.onCancellationRequested(() => {
			if (abortController) {
				abortController.abort();
			}
		});

		console.log(`[${requestId}] AI请求中... 场景: ${scenario}`);
		const start = Date.now();

		// 使用提示词系统处理上下文
		const promptManager = getPromptSystemManager();
		const processedPrompt = promptManager.processPrompt(scenario, context);

		let result: string[] = [];

		switch (config.type) {
			case AIModelType.DEEPSEEK: {
				if (scenario === PromptScenario.SYNTAX_COMPLETION) {
					// 语法补全使用FIM模式
					result = await callDeepSeek(
						context.prefix || '',
						context.suffix || '',
						config,
						scenario,
						signal
					);
				} else {
					result = await callDeepSeek(
						processedPrompt.userPrompt,
						'',
						config,
						scenario,
						signal,
						processedPrompt.systemPrompt
					);
				}
				break;
			}
			case AIModelType.QWEN: {
				if (scenario === PromptScenario.SYNTAX_COMPLETION) {
					// 语法补全使用FIM模式
					result = await callQwen(processedPrompt.userPrompt, config, scenario, signal);
				} else {
					// 其他场景使用Chat模式
					result = await callQwen(
						processedPrompt.userPrompt,
						config,
						scenario,
						signal,
						processedPrompt.systemPrompt
					);
				}
				break;
			}
			default:
				throw new Error(`不支持的AI模型类型: ${config.type}`);
		}

		const costs = Date.now() - start;
		console.log(`[${requestId}] AI请求完成[${costs}ms] 场景: ${scenario}`);
		return result;
	} catch (error: any) {
		if (typeof error === 'object' && error.toString().includes('Abort')) {
			console.log(`[${requestId}] 请求已取消`);
		}
		return [];
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
 * 使用AI生成代码
 * @param scenario 生成场景
 * @param context 提示词上下文
 * @param token 取消令牌
 * @returns 生成的代码
 */
export const generateCodeWithAI = async (
	scenario: PromptScenario,
	context: PromptContext,
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

	try {
		const requestId = Math.random().toString(36).substring(2, 8);
		console.log(`[${requestId}] AI代码生成请求中... `);

		const result = await callAIService(scenario, context, config, requestId, token);

		if (!result.length) return null;

		// 处理结果，移除可能的代码块标记
		let generatedCode = result[0];
		generatedCode = generatedCode.replace(/```(\w*\n)?/g, '').replace(/```/g, '');
		return generatedCode.trim();
	} catch (error: any) {
		console.error('AI代码生成失败:', error);
		if (typeof error === 'object' && error.toString().includes('Abort')) {
			console.log('代码生成请求已取消');
		}
		return null;
	}
};

/**
 * 获取AI补全建议
 */
export const getAICompletions = async (
	scenario: PromptScenario,
	context: PromptContext,
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
	const cacheKey = generateCacheKey(scenario, context);

	// 检查缓存
	const cachedResult = configManager.getCachedResult(cacheKey);
	if (cachedResult) {
		console.log(`使用缓存的AI补全结果`);
		return cachedResult;
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
			const aiResponses = await callAIService(scenario, context, config, requestId, token);

			if (!aiResponses || aiResponses.length === 0) {
				resolve([]);
				return;
			}

			const completions: string[] = parseAICompletions(aiResponses);

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

			if (disposable) {
				disposable.dispose();
			}

			resolve(completionItems);
		};

		const debounced = configManager.debounce(sendRequest);
		if (!debounced) {
			resolve([]);
		}
	});
};

/**
 * 生成缓存键
 */
const generateCacheKey = (scenario: PromptScenario, context: PromptContext): string => {
	// 提取关键信息用于缓存
	const keyComponents = [
		scenario,
		context.languageId,
		hashString(context.prefix || ''),
		hashString(context.suffix || ''),
		hashString(context.userPrompt || ''),
		hashString(context.selectedCode || '')
	];

	return keyComponents.join(':');
};

/**
 * 简单的字符串哈希算法
 */
const hashString = (str: string): string => {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash.toString(16);
};

/**
 * 获取位置信息
 * @param offset 偏移量
 * @param code 代码
 * @returns 位置信息
 */
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
 * 创建提示词上下文的便捷函数
 * @param languageId 语言ID
 * @param code 完整代码
 * @param offset 光标位置
 * @param additionalContext 额外上下文
 * @returns 提示词上下文
 */
export const createPromptContext = (
	languageId: string,
	code: string,
	offset: number,
	additionalContext?: Partial<PromptContext>
): PromptContext => {
	const prefix = code.substring(0, offset);
	const suffix = code.substring(offset);

	return {
		languageId,
		prefix,
		suffix,
		fullCode: code,
		...additionalContext
	};
};

/**
 * 根据错误信息自动修复代码
 * @param languageId 语言ID
 * @param errorCode 有错误的代码
 * @param errorMessage 错误信息
 * @param token 取消令牌
 * @returns 修复后的代码
 */
export const autoFixCode = async (
	languageId: string,
	errorCode: string,
	errorMessage: string,
	token?: CancellationToken
): Promise<string | null> => {
	const context: PromptContext = {
		languageId,
		selectedCode: errorCode,
		errorMessage: errorMessage,
		fullCode: errorCode
	};

	return generateCodeWithAI(PromptScenario.ERROR_FIXING, context, token);
};

/**
 * 代码优化
 * @param languageId 语言ID
 * @param code 要优化的代码
 * @param optimizationGoal 优化目标
 * @param token 取消令牌
 * @returns 优化后的代码
 */
export const optimizeCode = async (
	languageId: string,
	code: string,
	optimizationGoal?: string,
	token?: CancellationToken
): Promise<string | null> => {
	const context: PromptContext = {
		languageId,
		selectedCode: code,
		userPrompt: optimizationGoal,
		fullCode: code
	};

	return generateCodeWithAI(PromptScenario.CODE_OPTIMIZATION, context, token);
};

/**
 * 代码解释
 * @param languageId 语言ID
 * @param code 要解释的代码
 * @param focusArea 重点关注的领域
 * @param token 取消令牌
 * @returns 代码解释
 */
export const explainCode = async (
	languageId: string,
	code: string,
	focusArea?: string,
	token?: CancellationToken
): Promise<string | null> => {
	const context: PromptContext = {
		languageId,
		selectedCode: code,
		userPrompt: focusArea,
		fullCode: code
	};

	return generateCodeWithAI(PromptScenario.CODE_EXPLANATION, context, token);
};

/**
 * 预设的场景API配置模板
 */
export const SCENARIO_API_PRESETS = {
	/**
	 * DeepSeek预设配置
	 */
	DEEPSEEK_PRESET: {
		[PromptScenario.SYNTAX_COMPLETION]: {
			model: 'deepseek-coder',
			temperature: 0.2,
			maxTokens: 256,
			useChatMode: false
		},
		[PromptScenario.CODE_GENERATION]: {
			model: 'deepseek-coder',
			temperature: 0.3,
			maxTokens: 1024,
			useChatMode: true
		},
		[PromptScenario.CODE_EXPLANATION]: {
			model: 'deepseek-coder',
			temperature: 0.4,
			maxTokens: 1024,
			useChatMode: true
		},
		[PromptScenario.CODE_OPTIMIZATION]: {
			model: 'deepseek-coder',
			temperature: 0.3,
			maxTokens: 1024,
			useChatMode: true
		},
		[PromptScenario.ERROR_FIXING]: {
			model: 'deepseek-coder',
			temperature: 0.2,
			maxTokens: 1024,
			useChatMode: true
		}
	} as Partial<Record<PromptScenario, ScenarioAPIConfig>>,

	/**
	 * 通义千问预设配置
	 */
	QWEN_PRESET: {
		[PromptScenario.SYNTAX_COMPLETION]: {
			model: 'qwen-coder-turbo',
			temperature: 0.2,
			maxTokens: 256,
			useChatMode: false
		},
		[PromptScenario.CODE_GENERATION]: {
			model: 'qwen-coder-turbo',
			temperature: 0.3,
			maxTokens: 1024,
			useChatMode: true
		},
		[PromptScenario.CODE_EXPLANATION]: {
			model: 'qwen-coder-turbo',
			temperature: 0.4,
			maxTokens: 1024,
			useChatMode: true
		},
		[PromptScenario.CODE_OPTIMIZATION]: {
			model: 'qwen-coder-turbo',
			temperature: 0.3,
			maxTokens: 1024,
			useChatMode: true
		},
		[PromptScenario.ERROR_FIXING]: {
			model: 'qwen-coder-turbo',
			temperature: 0.2,
			maxTokens: 1024,
			useChatMode: true
		}
	} as Partial<Record<PromptScenario, ScenarioAPIConfig>>
};

// 重新导出提示词系统相关内容
export { PromptScenario, getPromptSystemManager } from './promptSystem';

export type { PromptContext, PromptTemplate, SQLLanguageVariables } from './promptSystem';

/**
 * 流式生成代码的回调函数类型
 */
export interface StreamingCodeCallback {
	onProgress: (partialCode: string, isComplete: boolean) => void;
	onError?: (error: Error) => void;
}

/**
 * 使用流式生成代码（模拟流式效果）
 * @param scenario 场景类型
 * @param context 提示词上下文
 * @param callback 流式回调函数
 * @param token 取消令牌
 * @returns Promise<string | null> 最终生成的完整代码
 */
export const generateCodeWithAIStreaming = async (
	scenario: PromptScenario,
	context: PromptContext,
	callback: StreamingCodeCallback,
	token?: CancellationToken
): Promise<string | null> => {
	try {
		// 先获取完整的生成结果
		const fullCode = await generateCodeWithAI(scenario, context, token);

		if (!fullCode) {
			return null;
		}

		// 模拟流式输出 - 逐行处理
		const lines = fullCode.split('\n');
		let currentOutput = '';

		for (let i = 0; i < lines.length; i++) {
			if (token?.isCancellationRequested) {
				console.log('请求被取消');
				break;
			}

			// 添加当前行到输出
			if (i > 0) {
				currentOutput += '\n';
			}
			currentOutput += lines[i];

			// 每输出一行都触发回调
			const isComplete = i === lines.length - 1;
			callback.onProgress(currentOutput, isComplete);

			// 添加延迟模拟真实的流式效果
			if (!isComplete) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		return fullCode;
	} catch (error) {
		console.error('流式代码生成失败:', error);
		if (callback.onError) {
			callback.onError(error as Error);
		}
		return null;
	}
};
