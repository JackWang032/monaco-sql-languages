import { useEffect, useState } from 'react';
import { DiffLine } from './types';
import { createRoot } from 'react-dom/client';
import { editor } from 'monaco-editor/esm/vs/editor/editor.api';

export const DeletedLineViewZone: React.FC<{ lines: DiffLine[]; languageId: string }> = ({
	lines,
	languageId
}) => {
	const [highlightedLines, setHighlightedLines] = useState<string[]>([]);

	// 对deleteLine进行语法高亮
	const highlightCode = async () => {
		try {
			const highlighted = await Promise.all(
				lines.map(async (line) => {
					if (line.content.trim() === '') {
						return '';
					}
					const colorizedHtml = await editor.colorize(line.content, languageId, {});
					return colorizedHtml;
				})
			);
			setHighlightedLines(highlighted);
		} catch (error) {
			console.warn('Failed to highlight deleted lines:', error);
			// 如果高亮失败，使用原始内容
			setHighlightedLines(lines.map((line) => line.content));
		}
	};

	useEffect(() => {
		highlightCode();
	}, [lines, languageId]);

	return (
		<div className="deleted-lines-view-zone">
			{lines.map((line, index) => (
				<div key={index} className="deleted-line">
					<span
						className="line-content"
						dangerouslySetInnerHTML={{
							__html: highlightedLines[index] || line.content
						}}
					/>
				</div>
			))}
		</div>
	);
};

export const createDeletedLinesViewZone = (
	editorInstance: editor.IStandaloneCodeEditor,
	deletedLines: DiffLine[],
	afterLineNumber: number,
	languageId: string,
	onDispose?: () => void
): { dispose: () => void } => {
	let domNode: HTMLDivElement | null = null;
	let reactRoot: any = null;
	let viewZoneId: string | null = null;

	domNode = document.createElement('div');
	domNode.className = 'deleted-lines-view-zone-container';

	reactRoot = createRoot(domNode);

	reactRoot.render(<DeletedLineViewZone lines={deletedLines} languageId={languageId} />);

	const heightInLines = Math.max(1, deletedLines.length);
	editorInstance.changeViewZones((changeAccessor) => {
		viewZoneId = changeAccessor.addZone({
			afterLineNumber,
			heightInLines,
			domNode: domNode!
		});
	});

	const dispose = () => {
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

		if (onDispose) {
			onDispose();
		}

		viewZoneId = null;
		domNode = null;
		reactRoot = null;
	};

	return { dispose };
};
