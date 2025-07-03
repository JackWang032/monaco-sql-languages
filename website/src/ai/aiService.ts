import { CancellationToken, languages } from 'monaco-editor/esm/vs/editor/editor.api';
import { AIModelConfig, AIModelType, StreamingCodeCallback } from './types';
import { PromptScenario, PromptContext, getPromptSystemManager } from './promptSystem';
import { callDeepSeek, callQwen } from './apiClient';
import { getAICompletionConfigManager } from './config';
import { generateCacheKey, parseAICompletions, cleanGeneratedCode } from './utils';

// 全局变量用于取消请求
let abortController: AbortController | null = null;

/**
 * 调用AI服务的核心函数
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
		const generatedCode = cleanGeneratedCode(result[0]);
		return generatedCode;
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
 * @param scenario 场景类型
 * @param context 提示词上下文
 * @param token 取消令牌
 * @returns AI补全建议
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
