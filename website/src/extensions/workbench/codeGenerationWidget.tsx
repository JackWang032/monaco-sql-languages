import React, { useState, useCallback, useRef } from 'react';
import { generateCodeWithAI } from '../../languages/helpers/aiCompletionService';
import { editor } from 'monaco-editor/esm/vs/editor/editor.api';
import { monaco } from '@dtinsight/molecule/esm/molecule.api';

// Widget样式 - 使用Monaco编辑器主题色
const getStyles = (widgetWidth?: number) => ({
	container: {
		backgroundColor: '#1e1e1e', // 深色背景，符合Monaco编辑器主题
		boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
		borderRadius: '4px',
		width: widgetWidth ? `${widgetWidth}px` : '380px',
		maxHeight: '500px',
		display: 'flex',
		flexDirection: 'column' as const,
		overflow: 'hidden',
		border: '1px solid #3c3c3c'
	},
	header: {
		padding: '8px 10px',
		backgroundColor: '#252526',
		color: '#cccccc',
		fontWeight: '500',
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		fontSize: '13px'
	},
	content: {
		padding: '10px',
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '10px',
		backgroundColor: '#252526'
	},
	input: {
		padding: '8px 10px',
		border: '1px solid #3c3c3c',
		borderRadius: '3px',
		width: '100%',
		minHeight: '60px',
		resize: 'vertical' as const,
		backgroundColor: '#1e1e1e',
		color: '#cccccc',
		fontFamily: 'Consolas, Monaco, monospace',
		fontSize: '13px'
	},
	footer: {
		padding: '8px 10px',
		backgroundColor: '#252526',
		display: 'flex',
		justifyContent: 'flex-end',
		gap: '8px'
	},
	button: {
		padding: '6px 12px',
		border: 'none',
		borderRadius: '3px',
		cursor: 'pointer',
		backgroundColor: '#0e639c', // Monaco蓝色主题色
		color: 'white',
		fontSize: '12px',
		transition: 'background-color 0.2s'
	},
	cancelButton: {
		backgroundColor: '#3c3c3c',
		color: '#cccccc',
		border: 'none'
	},
	loading: {
		padding: '10px',
		textAlign: 'center' as const,
		color: '#cccccc',
		fontSize: '12px'
	},
	codePreview: {
		padding: '10px',
		backgroundColor: '#1e1e1e',
		borderRadius: '3px',
		border: '1px solid #3c3c3c',
		maxHeight: '200px',
		overflow: 'auto',
		whiteSpace: 'pre-wrap' as const,
		fontSize: '13px',
		color: '#d4d4d4',
		fontFamily: 'Consolas, Monaco, monospace'
	},
	iconButton: {
		cursor: 'pointer',
		fontSize: '14px',
		lineHeight: 1,
		padding: '4px',
		color: '#cccccc',
		width: '18px',
		height: '18px',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		transition: 'background-color 0.2s',
		borderRadius: '3px'
	}
});

/**
 * 代码生成Widget组件的属性定义
 */
interface CodeGenerationWidgetProps {
	editorInstance: editor.IStandaloneCodeEditor;
	initialPosition: monaco.Position;
	initialSelection: monaco.Range | null;
	widgetWidth?: number; // 小部件宽度
	onClose: () => void;
}

/**
 * 代码生成组件状态
 */
interface CodeGenerationWidgetState {
	prompt: string;
	isGenerating: boolean;
	generatedCode: string | null;
}

/**
 * 代码生成Widget组件
 */
const CodeGenerationWidget: React.FC<CodeGenerationWidgetProps> = ({
	editorInstance,
	initialPosition,
	initialSelection,
	widgetWidth,
	onClose
}) => {
	// 组件状态
	const [state, setState] = useState<CodeGenerationWidgetState>({
		prompt: '',
		isGenerating: false,
		generatedCode: null
	});

	// React组件容器引用
	const containerRef = useRef<HTMLDivElement>(null);

	// 获取编辑器语言ID
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

	// 处理提交
	const handleSubmit = async () => {
		if (state.prompt.trim() === '') return;
		setState((prev) => ({ ...prev, isGenerating: true }));

		try {
			// 获取当前代码（可选，如果已有选中代码则作为上下文）
			const selectedText = getSelectedText();
			const languageId = getLanguageId();

			// 生成代码
			const generatedCode = await generateCodeWithAI(
				languageId,
				state.prompt,
				selectedText || undefined
			);

			setState((prev) => ({
				...prev,
				isGenerating: false,
				generatedCode
			}));
		} catch (error) {
			console.error('生成代码失败:', error);
			setState((prev) => ({ ...prev, isGenerating: false }));
		}
	};

	// 插入生成的代码
	const insertGeneratedCode = useCallback(() => {
		if (!state.generatedCode) return;

		// 如果有选择范围，则替换选中范围，否则在初始位置插入
		if (initialSelection) {
			editorInstance.executeEdits('ai-code-generation', [
				{
					range: initialSelection,
					text: state.generatedCode,
					forceMoveMarkers: true
				}
			]);
		} else {
			editorInstance.executeEdits('ai-code-generation', [
				{
					range: {
						startLineNumber: initialPosition.lineNumber,
						startColumn: initialPosition.column,
						endLineNumber: initialPosition.lineNumber,
						endColumn: initialPosition.column
					},
					text: state.generatedCode,
					forceMoveMarkers: true
				}
			]);
		}

		// 关闭组件
		onClose();
	}, [editorInstance, state.generatedCode, initialPosition, initialSelection, onClose]);

	// 隐藏Widget（调用外部传入的onClose回调）
	const hideWidget = useCallback(() => {
		onClose();
	}, [onClose]);

	// 处理按键事件
	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === 'Escape') {
				hideWidget();
			} else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				handleSubmit();
			}
		},
		[hideWidget, handleSubmit]
	);

	// 渲染组件UI
	// 生成基于小部件宽度的样式
	const dynamicStyles = getStyles(widgetWidth);

	return (
		<div ref={containerRef} style={dynamicStyles.container} onKeyDown={handleKeyDown}>
			<div style={dynamicStyles.header}>
				<span>AI 代码生成</span>
				<span style={dynamicStyles.iconButton} onClick={hideWidget}>
					×
				</span>
			</div>

			<div style={dynamicStyles.content}>
				<textarea
					style={dynamicStyles.input}
					placeholder="简单描述你需要的代码，如: 查询最近30天活跃用户"
					value={state.prompt}
					onChange={(e) => {
						setState((prev) => ({ ...prev, prompt: e.target.value }));
					}}
					disabled={state.isGenerating}
					autoFocus
				/>

				{state.isGenerating && <div style={dynamicStyles.loading}>正在生成代码...</div>}

				{state.generatedCode && <div style={dynamicStyles.codePreview}>{state.generatedCode}</div>}
			</div>

			<div style={dynamicStyles.footer}>
				<button style={{ ...dynamicStyles.button, ...dynamicStyles.cancelButton }} onClick={hideWidget}>
					取消
				</button>

				{state.generatedCode ? (
					<button style={{ ...dynamicStyles.button, ...dynamicStyles.primaryButton }} onClick={insertGeneratedCode}>
						插入
					</button>
				) : (
					<button
						style={{ ...dynamicStyles.button, ...dynamicStyles.primaryButton }}
						onClick={handleSubmit}
						disabled={state.isGenerating || state.prompt.trim() === ''}
					>
						生成
					</button>
				)}
			</div>
		</div>
	);
};

export default CodeGenerationWidget;

// 添加CSS样式到文档
const style = document.createElement('style');
style.innerHTML = `
.code-generation-overlay-widget {
  z-index: 50;
}

.code-generation-overlay {
  transition: opacity 0.2s, transform 0.2s;
  opacity: 1;
  transform: translateY(0);
}

.code-generation-overlay:focus-within {
  outline: none;
  box-shadow: 0 0 0 2px #0e639c33;
}
`;
document.head.appendChild(style);
