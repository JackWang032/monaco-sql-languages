import { DiffLine, DiffLineType } from './codeGenerationWidget';
import { diffLines } from 'diff';

export function debounce<T extends (...args: unknown[]) => unknown>(
	func: T,
	timeout: number,
	immediate?: boolean
): (...args: Parameters<T>) => unknown {
	let timer: NodeJS.Timeout | null = null;
	return (...args) => {
		if (timer) {
			clearTimeout(timer);
		}
		if (immediate && !timer) {
			return func?.(...args);
		}

		timer = setTimeout(() => {
			timer && clearTimeout(timer);
			timer = null;
			func?.(...args);
		}, timeout);
	};
}

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
