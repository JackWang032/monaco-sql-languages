import OpenAI from 'openai';
import { AIModelConfig, AIModelType, ModelParams } from './types';
import { PromptScenario } from './promptSystem';

/**
 * 创建OpenAI兼容的客户端
 * @param config AI模型配置
 * @param scenario 使用场景
 * @returns OpenAI客户端实例
 */
export const createOpenAIClient = (config: AIModelConfig, scenario?: PromptScenario): OpenAI => {
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
 * 获取场景的模型参数
 * @param config AI模型配置
 * @param scenario 使用场景
 * @param templateParams 提示词模板参数
 * @returns 模型参数
 */
export const getScenarioModelParams = (
	config: AIModelConfig,
	scenario: PromptScenario,
	templateParams?: { temperature?: number; maxTokens?: number }
): ModelParams => {
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
 * 调用DeepSeek API
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
 * 调用通义千问API
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
