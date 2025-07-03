import 'monaco-sql-languages/esm/all.contributions.js';
import './languageWorker';
import './theme';
import { setupLanguageFeatures, LanguageIdEnum } from 'monaco-sql-languages/esm/main.js';
import { completionService } from './helpers/completionService';
import { languages } from 'monaco-editor/esm/vs/editor/editor.api';
import { getAICompletions } from '../ai/aiService';
import { getAICompletionConfigManager } from '../ai/config';
import { PromptScenario } from '../ai/promptSystem';

// 初始化AI补全配置 - 确保在应用启动时就加载配置
(() => {
	try {
		const configManager = getAICompletionConfigManager();
		configManager.loadConfig();
		console.log('AI补全配置初始化完成');
	} catch (error) {
		console.error('初始化AI补全配置失败:', error);
	}
})();

/**
 * replace dtstack custom params, eg: @@{componentParams}, ${taskCustomParams}
 * @param code editor value
 * @returns replaced string
 */
const preprocessCode = (code: string): string => {
	const regex1 = /@@{[A-Za-z0-9._-]*}/g;
	const regex2 = /\${[A-Za-z0-9._-]*}/g;
	let result = code;

	if (regex1.test(code)) {
		result = result.replace(regex1, (str) => {
			return str.replace(/@|{|}|\.|-/g, '_');
		});
	}
	if (regex2.test(code)) {
		result = result.replace(regex2, (str) => {
			return str.replace(/\$|{|}|\.|-/g, '_');
		});
	}
	return result;
};

/**
 * replace dtstack custom grammar, eg: @@{componentParams}, ${taskCustomParams}
 * @param code editor value
 * @param mark some sql grammar need special mark to replace the beginning and the end
 * @returns replaced string
 */
const preprocessCodeHive = (code: string, mark?: string): string => {
	const regex1 = /@@{[A-Za-z0-9._-]*}/g;
	const regex2 = /\${[A-Za-z0-9._-]*}/g;
	let result = code;

	if (regex1.test(code)) {
		result = result.replace(regex1, (str) => {
			if (mark) {
				return str
					.replace(/@/, mark)
					.replace(/}/, mark)
					.replace(/@|{|\.|-/g, '_');
			}
			return str.replace(/@|{|}|\.|-/g, '_');
		});
	}
	if (regex2.test(code)) {
		result = result.replace(regex2, (str) => {
			if (mark) {
				return str.replace(/\$|}/g, mark).replace(/{|\.|-/g, '_');
			}
			return str.replace(/\$|{|}|\.|-/g, '_');
		});
	}
	return result;
};

setupLanguageFeatures(LanguageIdEnum.FLINK, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});

setupLanguageFeatures(LanguageIdEnum.SPARK, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});

setupLanguageFeatures(LanguageIdEnum.HIVE, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode: (code: string) => preprocessCodeHive(code, '`')
});

setupLanguageFeatures(LanguageIdEnum.MYSQL, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});

setupLanguageFeatures(LanguageIdEnum.TRINO, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});

setupLanguageFeatures(LanguageIdEnum.PG, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});

setupLanguageFeatures(LanguageIdEnum.IMPALA, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});

const registerInlineCompletionsForLanguage = (languageId: string) => {
	// 用于跟踪输入变化
	let lastPosition = { lineNumber: 0, column: 0 };
	let lastModelVersion = 0;

	languages.registerInlineCompletionsProvider(languageId, {
		provideInlineCompletions: async (model, position, context, token) => {
			// 检查输入是否有实质性变化
			const currentModelVersion = model.getVersionId();
			const positionChanged =
				position.lineNumber !== lastPosition.lineNumber ||
				position.column !== lastPosition.column;

			// 只移动光标跳过请求
			if (currentModelVersion === lastModelVersion && !positionChanged) {
				return { items: [] };
			}
			// 更新状态
			lastModelVersion = currentModelVersion;
			lastPosition = { ...position };

			// 获取AI配置管理器实例
			const configManager = getAICompletionConfigManager();

			// 检查AI补全是否启用
			if (!configManager.getEnabled()) {
				return { items: [] };
			}

			// 获取配置
			const config = configManager.getConfig();
			if (!config || !config.apiKey) {
				console.warn('AI补全未配置API Key');
				return { items: [] };
			}

			try {
				// 获取当前代码和光标位置
				const code = model.getValue();
				const offset = model.getOffsetAt(position);
				const prefix = code.substring(0, offset);
				const suffix = code.substring(offset);

				const aiCompletionItems = await getAICompletions(
					PromptScenario.SYNTAX_COMPLETION,
					{
						languageId,
						prefix,
						suffix
					},
					token
				);

				if (aiCompletionItems.length === 0) {
					return { items: [] };
				}

				// 当前行的光标前缀代码
				const linePrefix = model
					.getLineContent(position.lineNumber)
					.substring(0, position.column - 1);

				// 转换为行内补全格式
				const items = aiCompletionItems.map((completion) => ({
					text: linePrefix + completion.text,
					range: {
						startLineNumber: position.lineNumber,
						startColumn: 1,
						endLineNumber: position.lineNumber,
						endColumn: position.column
					}
				}));

				console.log('实际补全结果：', items);

				return {
					items
				};
			} catch (error) {
				console.error(`获取${languageId}行内补全失败:`, error);
				return { items: [] };
			}
		},
		freeInlineCompletions() {}
	});
};

Object.values(LanguageIdEnum).forEach((languageId) => {
	registerInlineCompletionsForLanguage(languageId);
});

// 重新导出
export * from 'monaco-sql-languages/esm/main.js';
