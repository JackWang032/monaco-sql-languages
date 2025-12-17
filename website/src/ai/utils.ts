import { PromptContext } from './promptSystem';
import { DiffLine, DiffLineType } from './types';
import { diffLines } from 'diff';

/**
 * 生成缓存键
 * @param context 提示词上下文
 * @returns 缓存键
 */
export const generateCacheKey = (context: PromptContext): string => {
	// 提取关键信息用于缓存
	const keyComponents = [
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
 * @param str 要哈希的字符串
 * @returns 哈希值
 */
export const hashString = (str: string): string => {
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
 * 从AI补全结果解析出补全项
 * @param aiResponse AI模型的响应
 * @returns 解析后的补全项
 */
export const parseAICompletions = (aiResponses: string[]): string[] => {
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
 * 清理生成的代码，移除代码块标记
 * @param generatedCode 生成的代码
 * @returns 清理后的代码
 */
export const cleanGeneratedCode = (generatedCode: string): string => {
	return generatedCode
		.replace(/```(\w*\n)?/g, '')
		.replace(/```/g, '')
		.trim();
};

/**
 * 计算两个字符串数组的diff
 */
export const calculateDiff = (originalLines: string[], newLines: string[]): DiffLine[] => {
	const result: DiffLine[] = [];

	// 将字符串数组转换为字符串
	const originalText = originalLines.join('\n');
	const newText = newLines.join('\n');

	// 使用 diff 库计算差异
	const diffs = diffLines(originalText, newText);

	let originalLineNumber = 1;
	let newLineNumber = 1;

	diffs.forEach((diff) => {
		if (diff.added) {
			// 添加的行
			const lines = diff.value.split('\n').filter(
				(line, index, arr) =>
					// 过滤掉最后一个空行（如果存在）
					!(index === arr.length - 1 && line === '')
			);

			lines.forEach((line) => {
				result.push({
					type: DiffLineType.ADDED,
					newLineNumber: newLineNumber++,
					content: line
				});
			});
		} else if (diff.removed) {
			// 删除的行
			const lines = diff.value.split('\n').filter(
				(line, index, arr) =>
					// 过滤掉最后一个空行（如果存在）
					!(index === arr.length - 1 && line === '')
			);

			lines.forEach((line) => {
				result.push({
					type: DiffLineType.DELETED,
					originalLineNumber: originalLineNumber++,
					content: line
				});
			});
		} else {
			// 未变化的行
			const lines = diff.value.split('\n').filter(
				(line, index, arr) =>
					// 过滤掉最后一个空行（如果存在）
					!(index === arr.length - 1 && line === '')
			);

			lines.forEach((line) => {
				result.push({
					type: DiffLineType.UNCHANGED,
					originalLineNumber: originalLineNumber++,
					newLineNumber: newLineNumber++,
					content: line
				});
			});
		}
	});

	return result;
};
