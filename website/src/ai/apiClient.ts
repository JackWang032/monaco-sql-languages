import OpenAI from 'openai';
import { AIModelConfig, AIModelType } from './types';
import { PromptScenario } from './promptSystem';

/**
 * 创建OpenAI兼容的客户端
 * @param config AI模型配置
 * @param scenario 使用场景
 * @returns OpenAI客户端实例
 */
export const createOpenAIClient = (config: AIModelConfig): OpenAI => {
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
 * 调用DeepSeek API
 * @param prompt 提示文本
 * @param systemPrompt 系统提示词（Chat模式）
 * @param suffix 后缀文本（FIM模式）
 * @param prefix 前缀文本（FIM模式）
 * @param config AI模型配置
 * @param scenario 使用场景
 * @param signal AbortController的signal，用于取消请求
 * @param temperature 温度参数
 * @returns AI补全响应数组
 */
export const callDeepSeek = async (params: {
	prompt: string;
	systemPrompt?: string;
	suffix?: string;
	prefix?: string;
	config: AIModelConfig;
	scenario: PromptScenario;
	temperature: number;
	signal?: AbortSignal;
}): Promise<string[]> => {
	const { prompt, systemPrompt, suffix, prefix, config, scenario, temperature, signal } = params;
	if (!config.apiKey) {
		throw new Error('未配置DeepSeek API Key');
	}

	const openai = createOpenAIClient(config);

	if (scenario !== PromptScenario.SYNTAX_COMPLETION) {
		const response = await openai.chat.completions.create(
			{
				model: config.model,
				temperature,
				messages: [
					{ role: 'system', content: systemPrompt || '' },
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
				model: config.model,
				temperature,
				prompt: prefix || '',
				suffix: suffix || ''
			},
			{ signal }
		);
		return response.choices.map((choice) => choice.text || '');
	}
};

/**
 * 调用通义千问API
 * @param prompt 提示文本
 * @param systemPrompt 系统提示词
 * @param config AI模型配置
 * @param scenario 使用场景
 * @param signal 用于取消请求
 * @param temperature 温度参数（从promptSystem获取）
 * @returns AI补全响应数组
 */
export const callQwen = async (params: {
	prompt: string;
	systemPrompt?: string;
	config: AIModelConfig;
	scenario: PromptScenario;
	temperature: number;
	signal?: AbortSignal;
}): Promise<string[]> => {
	const { prompt, systemPrompt, config, scenario, temperature, signal } = params;
	if (!config.apiKey) {
		throw new Error('未配置通义千问 API Key');
	}

	const openai = createOpenAIClient(config);

	if (scenario !== PromptScenario.SYNTAX_COMPLETION && systemPrompt) {
		// Chat模式
		const response = await openai.chat.completions.create(
			{
				model: config.model,
				temperature,
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
				model: config.model,
				temperature,
				prompt
			},
			{ signal }
		);
		return response.choices.map((choice) => choice.text || '');
	}
};
