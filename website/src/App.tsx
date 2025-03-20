import 'reflect-metadata';
import React, { useEffect, useRef, useState } from 'react';
import { create, Workbench } from '@dtinsight/molecule';
import InstanceService from '@dtinsight/molecule/esm/services/instanceService';
import { ExtendsWorkbench } from './extensions/workbench';
import { version, dependencies } from '../../package.json';
import { editor } from 'monaco-editor/esm/vs/editor/editor.api';
import { registerCodeGenerationKeyBinding } from './languages/helpers/aiCompletionService';

import './languages';

import '@dtinsight/molecule/esm/style/mo.css';

import './App.css';

/**
 * Allow code completion when typing in snippets.
 *
 * You can also set configurations when creating monaco-editor instance
 */
editor.onDidCreateEditor((editorInstance) => {
	// 设置只用回车键接受补全建议
	editorInstance.updateOptions({
		// 接受补全按键配置为仅回车键
		acceptSuggestionOnEnter: 'on',
		suggest: {
			snippetsPreventQuickSuggestions: false,
		},
		inlineSuggest: {
			enabled: false,
		},
	});

	// 注册代码生成快捷键 (Command+I / Ctrl+I)
	try {
		registerCodeGenerationKeyBinding(editorInstance);
		console.log('AI代码生成快捷键注册成功');
	} catch (error) {
		console.error('注册AI代码生成快捷键失败:', error);
	}
});

// 全局存储活动编辑器实例
let activeEditor: editor.IStandaloneCodeEditor | null = null;

// 获取活动编辑器实例
export const getActiveEditor = (): editor.IStandaloneCodeEditor | null => {
	return activeEditor;
};

// 设置活动编辑器实例
export const setActiveEditor = (editorInstance: editor.IStandaloneCodeEditor | null): void => {
	activeEditor = editorInstance;
};

function App(): React.ReactElement {
	const refMoInstance = useRef<InstanceService>();
	const [MyWorkbench, setMyWorkbench] = useState<React.ReactElement>();

	// 全局监听编辑器活动状态
	useEffect(() => {
		const handleEditorFocus = (e: editor.IStandaloneCodeEditor) => {
			setActiveEditor(e);
		};

		// editor.onDidFocusEditorWidget(handleEditorFocus);

		return () => {
			// 清理工作
			setActiveEditor(null);
		};
	}, []);

	useEffect(() => {
		if (!refMoInstance.current) {
			refMoInstance.current = create({
				extensions: [ExtendsWorkbench]
			});
			if (refMoInstance.current) {
				const IDE = () => refMoInstance.current?.render(<Workbench />);
				setMyWorkbench(IDE);
			}
		}
	}, []);

	return (
		<div>
			{MyWorkbench}
		</div>
	);
}

window.console.log(
	`%c dt-sql-parser: ${dependencies['dt-sql-parser']} \n\n monaco-sql-languages: ${version}`,
	'font-family: Cabin, Helvetica, Arial, sans-serif;text-align: left;font-size:26px;color:#B21212;'
);

export default App;
