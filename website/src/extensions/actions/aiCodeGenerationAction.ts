import { BaseAction } from '@dtinsight/molecule/esm/glue';
import { CATEGORIES, KeyChord, KeyCode, KeyMod } from '@dtinsight/molecule/esm/monaco';
import { IMoleculeContext, KeybindingWeight } from '@dtinsight/molecule/esm/types';
import { createCodeGenerationOverlayWidget } from '@/ai/codeGenerationWidget';

/**
 * AI代码生成快捷键Action
 * 快捷键: Ctrl/Cmd + U
 */
export default class AICodeGenerationAction extends BaseAction {
	static readonly ID = 'ai.codeGeneration';

	// 当前活动的viewZone实例
	private static activeCodeGenerationViewZone: { dispose: () => void } | null = null;

	constructor(private molecule: IMoleculeContext) {
		super({
			id: AICodeGenerationAction.ID,
			label: molecule.locale.localize('ai.codeGeneration', 'AI Code Generation'),
			title: molecule.locale.localize('ai.codeGeneration', 'AI Code Generation'),
			category: CATEGORIES.Developer,
			alias: 'AI Code Generation',
			precondition: undefined,
			f1: true,
			keybinding: {
				when: undefined,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyU)
			}
		});
	}

	run() {
		try {
			// 获取当前活动的 Monaco Editor 实例
			let activeEditor = this.getActiveMonacoEditor();

			if (!activeEditor) {
				console.warn('No active Monaco Editor found');
				return;
			}

			// 获取当前选区和光标位置
			const selection = activeEditor.getSelection();
			const position = selection ? selection.getPosition() : activeEditor.getPosition();

			if (!position) {
				console.warn('No cursor position found');
				return;
			}

			// 如果有选择范围，则将其传递给widget供后续替换使用
			const selectionRange = selection && !selection.isEmpty() ? selection : null;

			// 如果已经有viewZone，先清理
			if (AICodeGenerationAction.activeCodeGenerationViewZone) {
				AICodeGenerationAction.activeCodeGenerationViewZone.dispose();
				AICodeGenerationAction.activeCodeGenerationViewZone = null;
			}

			// 创建新的ViewZone
			AICodeGenerationAction.activeCodeGenerationViewZone = createCodeGenerationOverlayWidget(
				activeEditor,
				position,
				selectionRange,
				undefined, // widgetWidth
				() => {
					// 当viewZone被dispose时清理全局状态
					AICodeGenerationAction.activeCodeGenerationViewZone = null;
				}
			);

			console.log('AI Code Generation widget created at position:', position);
		} catch (error) {
			console.error('Failed to create AI Code Generation widget:', error);
		}
	}

	/**
	 * 获取当前活动的 Monaco Editor 实例
	 */
	private getActiveMonacoEditor(): any {
		// 获取当前激活的编辑器 tab
		const currentTab = this.molecule.editor.getCurrentTab();
		if (!currentTab) {
			console.warn('No current tab found');
			return null;
		}

		// 获取所有编辑器组
		const groups = this.molecule.editor.getGroups();
		if (!groups || groups.length === 0) {
			console.warn('No editor groups found');
			return null;
		}

		return groups[0].editorInstance;
	}
}
