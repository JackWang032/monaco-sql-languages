import { languages } from 'monaco-editor';
import { getAIConfigManager } from '../../ai/config';
import { getAICompletions } from '../../ai/aiService';
import { PromptScenario } from '../../ai/promptSystem';
import { LanguageIdEnum } from 'monaco-sql-languages/esm/main.js';

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
			const configManager = getAIConfigManager();

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

				// 转换为行内补全格式，过滤掉无效的补全项
				const items = aiCompletionItems
					.filter((completion) => {
						if (!completion.insertText) return false;
						if (typeof completion.insertText === 'string') {
							return completion.insertText.trim().length > 0;
						}
						return (
							completion.insertText.snippet &&
							completion.insertText.snippet.trim().length > 0
						);
					})
					.map((completion) => {
						const text =
							typeof completion.insertText === 'string'
								? completion.insertText
								: completion.insertText.snippet;
						return {
							insertText: linePrefix + text,
							range: {
								startLineNumber: position.lineNumber,
								startColumn: 1,
								endLineNumber: position.lineNumber,
								endColumn: position.column
							}
						};
					});

				console.log('实际补全结果：', items);

				// 确保返回的 items 数组不为空且所有项都有效
				if (!items || items.length === 0) {
					return { items: [] };
				}

				return {
					items: items.filter((item) => item && item.insertText)
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
