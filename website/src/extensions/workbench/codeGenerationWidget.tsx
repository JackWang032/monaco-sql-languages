import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
	generateCodeWithAI,
	generateCodeWithAIStreaming,
	StreamingCodeCallback
} from '../../languages/helpers/aiCompletionService';
import { PromptScenario, PromptContext } from '../../languages/helpers/promptSystem';

import { editor, Position, Range } from 'monaco-editor/esm/vs/editor/editor.api';
import TextArea from 'rc-textarea';
import { calculateDiff } from './utils';
import { createDeletedLinesViewZone } from './deletedLineViewZone';

export enum DiffLineType {
	UNCHANGED = 'unchanged',
	ADDED = 'added',
	DELETED = 'deleted'
}

export interface DiffLine {
	type: DiffLineType;
	originalLineNumber?: number; // 原始行号
	newLineNumber?: number; // 新行号
	content: string; // 行内容
}

interface CodeGenerationWidgetState {
	prompt: string;
	isGenerating: boolean;
	generatedCode: string | null;
	originalText: string; // 保存原始文本用于拒绝时恢复
	hasInserted: boolean; // 标记是否已插入代码
	generatedRange: Range | null; // 生成代码的范围
	diffLines: DiffLine[]; // diff结果
	isDiffMode: boolean; // 是否为diff模式
	isStreaming: boolean; // 是否正在流式生成
	streamingCode: string; // 流式生成的当前代码
}

/**
 * 代码生成Widget组件
 */
const CodeGenerationWidget: React.FC<CodeGenerationWidgetProps> = ({
	editorInstance,
	initialPosition,
	initialSelection,
	onClose,
	onHeightChange
}) => {
	// 保存原始文本
	const originalText = useRef<string>('');

	const [state, setState] = useState<CodeGenerationWidgetState>({
		prompt: '',
		isGenerating: false,
		generatedCode: null,
		originalText: '',
		hasInserted: false,
		generatedRange: null,
		diffLines: [],
		isDiffMode: false,
		isStreaming: false,
		streamingCode: ''
	});

	const containerRef = useRef<HTMLDivElement>(null);
	const textAreaRef = useRef<any>(null);
	const decorationsRef = useRef<string[]>([]);
	const deletedLineViewZonesRef = useRef<Array<{ dispose: () => void }>>([]);

	const getLanguageId = useCallback(() => {
		const model = editorInstance.getModel();
		return model ? model.getLanguageId() : 'sql';
	}, [editorInstance]);

	// 获取编辑器当前选中的代码
	const getSelectedText = useCallback(() => {
		const selection = editorInstance.getSelection();
		if (selection && !selection.isEmpty()) {
			const model = editorInstance.getModel();
			if (model) {
				return model.getValueInRange(selection);
			}
		}
		return '';
	}, [editorInstance]);

	// 添加绿色背景装饰到生成的代码
	const addGeneratedCodeDecoration = useCallback(
		(range: Range) => {
			const decorations = editorInstance.deltaDecorations(decorationsRef.current, [
				{
					range: range,
					options: {
						className: 'generated-code-decoration',
						isWholeLine: true
					}
				}
			]);
			decorationsRef.current = decorations;
		},
		[editorInstance]
	);

	// 清除所有装饰
	const clearDecorations = useCallback(() => {
		if (decorationsRef.current.length > 0) {
			editorInstance.deltaDecorations(decorationsRef.current, []);
			decorationsRef.current = [];
		}
	}, [editorInstance]);

	const clearViewZones = useCallback(() => {
		// 先记录当前数组的拷贝，避免在dispose过程中数组被修改
		const overlaysToDispose = [...deletedLineViewZonesRef.current];
		// 立即清空引用数组，防止重复调用
		deletedLineViewZonesRef.current = [];

		// 逐个dispose
		overlaysToDispose.forEach((overlay) => {
			try {
				overlay.dispose();
			} catch (error) {
				console.warn('Error disposing diff overlay:', error);
			}
		});
	}, []);

	// 应用diff展示
	const applyDiffDisplay = useCallback(
		(diffLines: DiffLine[]) => {
			// 先清除之前的展示
			clearDecorations();
			clearViewZones();

			if (!initialSelection) return;

			const model = editorInstance.getModel();
			if (!model) return;

			// 获取语言ID用于语法高亮
			const languageId = getLanguageId();

			// 首先替换原始内容为新内容（包含unchanged的行）
			const newLines = diffLines
				.filter((line) => line.type !== DiffLineType.DELETED)
				.map((line) => line.content);
			const newContent = newLines.join('\n');

			// 执行替换
			editorInstance.executeEdits('ai-code-generation-diff', [
				{
					range: initialSelection,
					text: newContent,
					forceMoveMarkers: true
				}
			]);

			// 计算新内容的范围
			const resultRange = new Range(
				initialSelection.startLineNumber,
				initialSelection.startColumn,
				initialSelection.startLineNumber + newLines.length - 1,
				newLines.length === 1
					? initialSelection.startColumn + newContent.length
					: newLines[newLines.length - 1].length + 1
			);

			let currentLineNumber = initialSelection.startLineNumber;
			let deletedLinesGroup: DiffLine[] = [];

			const addDeletedLinesViewZone = (
				deletedLines: DiffLine[],
				afterLine: number,
				languageId: string
			) => {
				if (deletedLines.length > 0) {
					const viewZone = createDeletedLinesViewZone(
						editorInstance,
						deletedLines,
						afterLine,
						languageId,
						() => {
							const index = deletedLineViewZonesRef.current.indexOf(viewZone);
							if (index > -1) {
								deletedLineViewZonesRef.current.splice(index, 1);
							}
						}
					);
					deletedLineViewZonesRef.current.push(viewZone);
				}
			};

			for (const diffLine of diffLines) {
				if (diffLine.type === DiffLineType.DELETED) {
					// 收集连续的删除行
					deletedLinesGroup.push(diffLine);
				} else {
					if (deletedLinesGroup.length > 0) {
						addDeletedLinesViewZone(
							deletedLinesGroup,
							currentLineNumber - 1,
							languageId
						);
						deletedLinesGroup = [];
					}

					if (diffLine.type === DiffLineType.ADDED) {
						// 添加绿色背景色
						const addedDecorations = editorInstance.deltaDecorations(
							[],
							[
								{
									range: new Range(
										currentLineNumber,
										1,
										currentLineNumber,
										model.getLineContent(currentLineNumber).length + 1
									),
									options: {
										className: 'added-line-decoration',
										isWholeLine: true
									}
								}
							]
						);
						decorationsRef.current.push(...addedDecorations);
					}

					currentLineNumber++;
				}
			}

			// 处理最后的删除行组
			if (deletedLinesGroup.length > 0) {
				addDeletedLinesViewZone(deletedLinesGroup, currentLineNumber - 1, languageId);
			}

			return resultRange;
		},
		[editorInstance, initialSelection, clearDecorations, clearViewZones]
	);

	// 初始化时保存原始文本
	useEffect(() => {
		const selectedText = getSelectedText();
		originalText.current = selectedText;
		setState((prev) => ({ ...prev, originalText: selectedText }));
	}, [getSelectedText]);

	// 立即触发高度更新
	const triggerHeightUpdate = useCallback(() => {
		if (onHeightChange) {
			onHeightChange();
			// 高度更新后重新聚焦
			// setTimeout(() => {
			// 	if (textAreaRef.current && !state.hasInserted) {
			// 		// rc-textarea可能需要通过resizableTextArea或textArea属性访问原生元素
			// 		const textAreaElement =
			// 			textAreaRef.current.resizableTextArea?.textArea || textAreaRef.current;
			// 		if (textAreaElement && textAreaElement.focus) {
			// 			textAreaElement.focus();
			// 		}
			// 	}
			// }, 50);
		}
	}, [onHeightChange, state.hasInserted]);

	useEffect(() => {
		if (!containerRef.current) return;
		const observer = new ResizeObserver(() => {
			triggerHeightUpdate();
		});
		observer.observe(containerRef.current);

		return () => {
			observer.disconnect();
		};
	}, [containerRef]);

	// 组件卸载时清理装饰和OverlayWidget
	useEffect(() => {
		return () => {
			clearDecorations();
			clearViewZones();
		};
	}, [clearDecorations, clearViewZones]);

	// 流式更新diff显示
	const updateStreamingDiff = useCallback(
		(partialCode: string, originalText: string) => {
			const originalLines = originalText.split('\n');
			const newLines = partialCode.split('\n');
			const diffLines = calculateDiff(originalLines, newLines);

			// 清除之前的diff显示
			clearViewZones();

			// 应用新的diff显示
			applyDiffDisplay(diffLines);

			return diffLines;
		},
		[clearViewZones, applyDiffDisplay]
	);

	// 流式生成时的临时范围引用
	const streamingRangeRef = useRef<Range | null>(null);

	// 更新流式生成内容
	const updateStreamingContent = useCallback(
		(partialCode: string) => {
			if (!streamingRangeRef.current) {
				const lines = partialCode.split('\n');
				let insertRange: Range;
				let resultRange: Range;

				if (initialSelection) {
					// 如果有选中的范围，替换选中的内容
					insertRange = initialSelection;
				} else {
					// 如果没有选中的范围，在当前位置插入
					insertRange = new Range(
						initialPosition.lineNumber,
						initialPosition.column,
						initialPosition.lineNumber,
						initialPosition.column
					);
				}

				// 计算插入后的范围
				if (lines.length === 1) {
					// 单行
					resultRange = new Range(
						insertRange.startLineNumber,
						insertRange.startColumn,
						insertRange.startLineNumber,
						insertRange.startColumn + lines[0].length
					);
				} else {
					// 多行
					resultRange = new Range(
						insertRange.startLineNumber,
						insertRange.startColumn,
						insertRange.startLineNumber + lines.length - 1,
						lines[lines.length - 1].length + 1
					);
				}

				// 执行编辑
				editorInstance.executeEdits('ai-streaming-init', [
					{
						range: insertRange,
						text: partialCode,
						forceMoveMarkers: true
					}
				]);

				// 更新范围引用
				streamingRangeRef.current = resultRange;

				addGeneratedCodeDecoration(resultRange);
			} else {
				// 后续更新，替换已有内容
				const lines = partialCode.split('\n');
				const endLine = streamingRangeRef.current.startLineNumber + lines.length - 1;
				const endColumn =
					lines.length === 1
						? streamingRangeRef.current.startColumn + lines[0].length
						: lines[lines.length - 1].length + 1;

				const newRange = new Range(
					streamingRangeRef.current.startLineNumber,
					streamingRangeRef.current.startColumn,
					endLine,
					endColumn
				);

				// 执行编辑，替换内容
				editorInstance.executeEdits('ai-streaming-update', [
					{
						range: streamingRangeRef.current,
						text: partialCode,
						forceMoveMarkers: true
					}
				]);

				// 更新范围引用
				streamingRangeRef.current = newRange;

				// 添加流式生成装饰
				addGeneratedCodeDecoration(newRange);
			}
		},
		[editorInstance, addGeneratedCodeDecoration, initialSelection, initialPosition]
	);

	// 处理流式代码生成的回调
	const handleStreamingProgress = useCallback(
		(partialCode: string, isComplete: boolean) => {
			setState((prev) => ({
				...prev,
				streamingCode: partialCode,
				isStreaming: !isComplete
			}));

			// 如果有选中文本，实时更新diff
			const selectedText = getSelectedText();
			if (selectedText.trim()) {
				const diffLines = updateStreamingDiff(partialCode, selectedText);

				setState((prev) => ({
					...prev,
					diffLines,
					isDiffMode: true
				}));

				// 如果完成了，设置生成范围（在diff模式下通常使用选中的范围）
				if (isComplete && initialSelection) {
					// 在diff模式下，使用初始选中的范围作为生成范围
					setState((prev) => ({
						...prev,
						generatedRange: initialSelection
					}));
				}
			} else {
				// 如果没有选中文本，流式更新编辑器内容
				if (isComplete) {
					// 完成时，确保decoration应用到已有的内容
					if (streamingRangeRef.current) {
						// 最后一次确保decoration被正确应用
						addGeneratedCodeDecoration(streamingRangeRef.current);
					}
				} else {
					// 流式过程中，更新已插入的内容
					updateStreamingContent(partialCode);
				}
			}

			// 如果完成了生成
			if (isComplete) {
				// 确保有正确的生成范围
				const finalRange =
					streamingRangeRef.current ||
					initialSelection ||
					new Range(
						initialPosition.lineNumber,
						initialPosition.column,
						initialPosition.lineNumber,
						initialPosition.column
					);

				setState((prev) => ({
					...prev,
					isGenerating: false,
					generatedCode: partialCode,
					hasInserted: true,
					generatedRange: finalRange
				}));
			}
		},
		[
			getSelectedText,
			updateStreamingDiff,
			updateStreamingContent,
			addGeneratedCodeDecoration,
			applyDiffDisplay,
			initialSelection,
			initialPosition
		]
	);

	const handleSubmit = async () => {
		if (state.prompt.trim() === '') return;

		// 获取当前代码
		const selectedText = getSelectedText();
		const languageId = getLanguageId();

		// 保存原始文本
		originalText.current = selectedText;

		try {
			if (selectedText.trim()) {
				// 有选中代码时，使用普通请求
				setState((prev) => ({ ...prev, isGenerating: true, isStreaming: false }));

				const promptContext: PromptContext = {
					languageId,
					userPrompt: state.prompt,
					selectedCode: selectedText,
					fullCode: editorInstance.getValue()
				};

				const generatedCode = await generateCodeWithAI(
					PromptScenario.CODE_GENERATION,
					promptContext
				);

				if (generatedCode) {
					// 使用diff模式显示结果
					const originalLines = selectedText.split('\n');
					const newLines = generatedCode.split('\n');
					const diffLines = calculateDiff(originalLines, newLines);
					console.log('diffLines', diffLines);

					const resultRange = applyDiffDisplay(diffLines);
					setState((prev) => ({
						...prev,
						isGenerating: false,
						generatedCode,
						hasInserted: true,
						generatedRange: resultRange || null,
						diffLines,
						isDiffMode: true
					}));
				} else {
					setState((prev) => ({ ...prev, isGenerating: false }));
				}
			} else {
				// 没有选中代码时，使用流式生成
				setState((prev) => ({ ...prev, isGenerating: true, isStreaming: true }));

				// 重置流式生成范围引用
				streamingRangeRef.current = null;

				// 创建提示词上下文
				const promptContext: PromptContext = {
					languageId,
					userPrompt: state.prompt,
					selectedCode: undefined,
					fullCode: editorInstance.getValue()
				};

				// 流式生成代码
				const streamingCallback: StreamingCodeCallback = {
					onProgress: handleStreamingProgress,
					onError: (error) => {
						console.error('流式生成失败:', error);
						setState((prev) => ({
							...prev,
							isGenerating: false,
							isStreaming: false
						}));
					}
				};

				await generateCodeWithAIStreaming(
					PromptScenario.CODE_GENERATION,
					promptContext,
					streamingCallback
				);
			}
		} catch (error) {
			console.error('生成代码失败:', error);
			setState((prev) => ({
				...prev,
				isGenerating: false,
				isStreaming: false
			}));
		}
	};

	// 接受生成的代码
	const acceptGeneratedCode = useCallback(() => {
		// 重置流式生成范围引用
		streamingRangeRef.current = null;

		// 清除装饰和OverlayWidgets
		clearDecorations();
		clearViewZones();

		// 强制编辑器重新布局和渲染，确保所有ViewZone和OverlayWidget被正确清理
		setTimeout(() => {
			editorInstance.layout();
		}, 0);

		// 关闭组件，保留已插入的代码
		onClose();
	}, [onClose, clearDecorations, clearViewZones, editorInstance]);

	const rejectGeneratedCode = useCallback(() => {
		if (state.hasInserted && state.generatedRange) {
			// 恢复原始文本
			editorInstance.executeEdits('ai-code-generation-reject', [
				{
					range: state.generatedRange,
					text: originalText.current,
					forceMoveMarkers: true
				}
			]);
		}

		streamingRangeRef.current = null;

		clearDecorations();
		clearViewZones();

		// 强制编辑器重新布局和渲染，确保所有ViewZone和OverlayWidget被正确清理
		setTimeout(() => {
			editorInstance.layout();
		}, 0);

		onClose();
	}, [
		editorInstance,
		state.hasInserted,
		state.generatedRange,
		onClose,
		clearDecorations,
		clearViewZones
	]);

	const hideWidget = useCallback(() => {
		if (state.hasInserted) {
			// 如果已插入代码，恢复原始内容
			rejectGeneratedCode();
		} else {
			onClose();
		}
	}, [state.hasInserted, rejectGeneratedCode, onClose]);

	// 渲染组件UI
	return (
		<div ref={containerRef} className="code-gen-container">
			<div className="code-gen-main">
				<TextArea
					ref={textAreaRef}
					className="code-gen-input"
					placeholder="描述你想要生成的代码"
					autoSize={{ minRows: 1 }}
					value={state.prompt}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
							e.preventDefault();
							e.stopPropagation();
							handleSubmit();
						} else if (e.shiftKey && e.key === 'Enter') {
							e.preventDefault();
							e.stopPropagation();
							setState((prev) => ({ ...prev, prompt: prev.prompt + '\n' }));
						}
					}}
					onChange={(e) => {
						setState((prev) => ({ ...prev, prompt: e.target.value }));
					}}
					disabled={state.isGenerating || state.hasInserted}
					autoFocus={!state.hasInserted}
				/>

				<button className="code-gen-close-button" onClick={hideWidget}>
					×
				</button>
			</div>
			<div className="code-gen-actions">
				{state.hasInserted ? (
					<>
						<button
							className="code-gen-button code-gen-reject-button"
							onClick={rejectGeneratedCode}
						>
							拒绝
						</button>
						<button
							className="code-gen-button code-gen-accept-button"
							onClick={acceptGeneratedCode}
						>
							接受
						</button>
					</>
				) : (
					<button
						className={`code-gen-button code-gen-submit-button ${state.isStreaming ? 'streaming-button' : ''}`}
						onClick={handleSubmit}
						disabled={state.isGenerating || state.prompt.trim() === ''}
					>
						{state.isStreaming
							? '流式生成中...'
							: state.isGenerating
								? '生成中...'
								: 'Submit ↵'}
					</button>
				)}
			</div>
		</div>
	);
};

interface CodeGenerationWidgetProps {
	editorInstance: editor.IStandaloneCodeEditor;
	initialPosition: Position;
	initialSelection: Range | null;
	widgetWidth?: number;
	onClose: () => void;
	onHeightChange?: () => void;
}

export const createCodeGenerationOverlayWidget = (
	editorInstance: editor.IStandaloneCodeEditor,
	position: Position,
	selection: Range | null,
	widgetWidth?: number,
	onDispose?: () => void
): { dispose: () => void } => {
	let overlayWidget: editor.IOverlayWidget | null = null;
	let domNode: HTMLDivElement | null = null;
	let reactRoot: any = null;
	let viewZoneId: string | null = null;

	domNode = document.createElement('div');
	domNode.className = 'code-generation-overlay-widget';
	domNode.style.position = 'absolute';

	reactRoot = createRoot(domNode);

	reactRoot.render(
		<CodeGenerationWidget
			editorInstance={editorInstance}
			initialPosition={position}
			initialSelection={selection}
			widgetWidth={widgetWidth}
			onClose={() => dispose()}
			onHeightChange={() => {
				// 高度变化时需要更新ViewZone
				if (viewZoneId && domNode) {
					const actualHeight = domNode.clientHeight;
					editorInstance.changeViewZones((changeAccessor) => {
						changeAccessor.removeZone(viewZoneId!);
						viewZoneId = changeAccessor.addZone({
							afterLineNumber: Math.max(0, targetLineNumber - 1),
							heightInPx: actualHeight + 8,
							domNode: document.createElement('div'),
							onDomNodeTop: (top) => {
								if (domNode) {
									// 获取编辑器左侧偏移量（行号、代码折叠等组件的宽度）
									const layoutInfo = editorInstance.getLayoutInfo();
									const leftOffset = layoutInfo.contentLeft;

									domNode.style.top = `${top}px`;
									domNode.style.left = `${leftOffset}px`;
								}
							}
						});
					});
				}
			}}
		/>
	);

	const initialHeightInLines = 3;
	// 如果有选中范围，使用选中范围的起始行，否则使用当前位置
	const targetLineNumber = selection ? selection.startLineNumber : position.lineNumber;
	editorInstance.changeViewZones((changeAccessor) => {
		viewZoneId = changeAccessor.addZone({
			afterLineNumber: Math.max(0, targetLineNumber - 1),
			heightInLines: initialHeightInLines,
			domNode: document.createElement('div'),
			onDomNodeTop: (top) => {
				if (domNode) {
					// 获取编辑器左侧偏移量（行号、代码折叠等组件的宽度）
					const layoutInfo = editorInstance.getLayoutInfo();
					const leftOffset = layoutInfo.contentLeft;

					domNode.style.top = `${top}px`;
					domNode.style.left = `${leftOffset}px`;
				}
			}
		});
	});

	overlayWidget = {
		getId: () => `code-generation-overlay-${position.lineNumber}-${Date.now()}`,
		getDomNode: () => domNode!,
		getPosition: () => null
	};

	editorInstance.addOverlayWidget(overlayWidget);

	// 唤起时，将widget滚动到视口
	editorInstance.revealLineInCenter(targetLineNumber);

	// 清理函数
	const dispose = () => {
		if (overlayWidget && editorInstance) {
			editorInstance.removeOverlayWidget(overlayWidget);
		}
		if (viewZoneId && editorInstance) {
			editorInstance.changeViewZones((changeAccessor) => {
				changeAccessor.removeZone(viewZoneId!);
			});
		}
		if (reactRoot) {
			reactRoot.unmount();
		}
		if (domNode && domNode.parentNode) {
			domNode.parentNode.removeChild(domNode);
		}

		// 调用外部传入的dispose回调
		if (onDispose) {
			onDispose();
		}

		overlayWidget = null;
		viewZoneId = null;
		domNode = null;
		reactRoot = null;
	};

	return { dispose };
};

export default CodeGenerationWidget;
