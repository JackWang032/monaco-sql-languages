import { editor } from 'monaco-editor/esm/vs/editor/editor.api';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { createCodeGenerationOverlayWidget } from './codeGenerationWidget';

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
