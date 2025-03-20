import molecule from '@dtinsight/molecule';
import { Float } from '@dtinsight/molecule/esm/model';
import { IExtension } from '@dtinsight/molecule/esm/model/extension';
import Sidebar from './sidebar';
import { defaultEditorTab, defaultLanguageStatusItem } from './common';
import AICompletionPanel from './aiCompletionPanel';

export const defaultParseTreePanel = {
	id: 'ParseTreePanel',
	name: 'Parse Tree Visualizer'
};

export const defaultAICompletionPanel = {
	id: 'AICompletionPanel',
	name: 'AI 补全设置'
};

export const ExtendsWorkbench: IExtension = {
	id: 'ExtendWorkbench',
	name: 'ExtendWorkbench',

	activate() {
		const ParserSidebar = {
			id: 'ParserSidebar',
			title: 'Sidebar',
			render() {
				return <Sidebar />;
			}
		};

		molecule.sidebar.add(ParserSidebar);
		molecule.sidebar.setState({
			current: ParserSidebar.id
		});

		const parserActivityBarItem = {
			id: 'OnlineParser',
			icon: 'beaker',
			title: 'SQL Languages Online Parse'
		};

		const githubPageActivityBarItem = {
			id: 'GotoGithub',
			icon: 'github',
			title: 'Go To Github'
		};

		molecule.activityBar.remove('sidebar.explore.title');
		molecule.activityBar.remove('sidebar.search.title');

		molecule.activityBar.add([parserActivityBarItem, githubPageActivityBarItem]);
		molecule.activityBar.setState({
			selected: parserActivityBarItem.id
		});

		molecule.panel.add(defaultParseTreePanel);

		// 设置AuxiliaryBar配置
		// 初始化AuxiliaryBar，使用tabs模式
		molecule.auxiliaryBar.setMode('tabs');

		// 添加AI补全设置选项卡
		const aiCompletionTab = {
			key: 'aiCompletion',
			title: 'AI 补全设置'
		};
		molecule.auxiliaryBar.addAuxiliaryBar([aiCompletionTab]);

		// 监听选项卡点击事件
		molecule.auxiliaryBar.onTabClick(() => {
			const tab = molecule.auxiliaryBar.getCurrentTab();
			if (tab && tab.key === aiCompletionTab.key) {
				// 设置AuxiliaryBar内容
				molecule.auxiliaryBar.setChildren(<AICompletionPanel />);
			}

			molecule.layout.setAuxiliaryBar(!tab);
		});

		molecule.editor.open(defaultEditorTab);

		molecule.statusBar.add(defaultLanguageStatusItem, Float.right);
	},

	dispose() {}
};
