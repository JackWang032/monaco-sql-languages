import { editor, languages, Position } from 'monaco-editor/esm/vs/editor/editor.api';
import { CompletionService, ICompletionItem } from 'monaco-sql-languages/esm/languageService';
import { EntityContextType } from 'monaco-sql-languages/esm/main';

import { getCatalogs, getDataBases, getSchemas, getTables, getViews } from './dbMetaProvider';

const haveCatalogSQLType = (languageId: string) => {
	return ['flinksql', 'trinosql'].includes(languageId.toLowerCase());
};

const namedSchemaSQLType = (languageId: string) => {
	return ['trinosql', 'hivesql', 'sparksql'].includes(languageId);
};

function getInlineCompletionText(
	codeStr: string,
	snippetStr: string,
	codeTokens: any[],
	snippetTokens: any[]
) {
	const maxMatchTokenLength = Math.min(codeTokens.length, snippetTokens.length);

	if (maxMatchTokenLength < 1) {
		return null;
	}

	// 不断缩减窗口大小进行匹配
	for (var i = maxMatchTokenLength - 1; i >= 0; i--) {
		let unMatched = false;
		// debugger
		for (var j = 0; j <= i; j++) {
			const codeToken = codeTokens[codeTokens.length - 1 - i + j];
			const snippetToken = snippetTokens[j];
			const codeText = codeToken.text?.toUpperCase() || '';
			const snippetText = snippetToken.text?.toUpperCase() || '';

			// 输入中的token匹配了一部分
			const isTypingTokenSubMatched = j === i && snippetText.startsWith(codeText);

			// 输入中的token是identify
			const isTypingIdentifyToken =
				j === i && snippetToken.isIdentify && codeToken.isIdentify && !/\s$/.test(codeStr);

			// 已和模板完全匹配，则不需要再提供补全
			if (j === i && i === snippetTokens.length - 1 && codeText === snippetText) {
				// debugger
				unMatched = true;
				break;
			}

			// todo optimize branch judgment
			if (j !== i) {
				if (
					!(codeText === snippetText || (snippetToken.isIdentify && codeToken.isIdentify))
				) {
					unMatched = true;
					break;
				}
			} else {
				// 预测到要输入实体且键入了空格，则不进行补全，like 'create table ' => 'create table a1 (id int)'
				const isNextIdentifyToken =
					j < snippetTokens.length - 1 &&
					snippetTokens[j + 1].isIdentify &&
					/\s$/.test(codeStr);

				if (
					(codeText !== snippetText && !isTypingTokenSubMatched) ||
					isTypingIdentifyToken ||
					isNextIdentifyToken
				) {
					// 未输入完的keyword会被错误处理为identify，如果与模板token文本前缀匹配了则视为匹配， 'select id fro' matched 'select id from t1'
					if (
						!(
							codeToken.isIdentify &&
							!snippetToken.isIdentify &&
							snippetText.startsWith(codeToken.text)
						)
					) {
						unMatched = true;
						break;
					}
				}
			}
		}

		// 至少匹配一个token才提示
		if (!unMatched && i >= 1) {
			// debugger

			const lastCodeToken = codeTokens[codeTokens.length - 1];
			const isPairToken =
				lastCodeToken.text === snippetTokens[i].text &&
				["'", '(', ')', '"'].includes(lastCodeToken.text);

			// 如果已经键入了空格则会去除模板中的空格
			const needTrim = /\s$/.test(codeStr);

			const sliceIndex =
				/\s$/.test(codeStr) ||
				isPairToken ||
				lastCodeToken.isStringLiteral ||
				// 单个字符的token不需要再提供该字符, 否则会重复添加
				snippetTokens[i].text.length <= 1
					? snippetTokens[i].stop + 1
					: snippetTokens[i].start;

			if (sliceIndex < snippetStr.length) {
				const additionText = needTrim
					? snippetStr.slice(sliceIndex).trimStart()
					: snippetStr.slice(sliceIndex);
				return additionText;
			}
		}
	}
	return null;
}

const filterTokens = (tokens: any[]) => {
	const t = tokens.filter((item) => !item.isWhiteSpace);
	var i = 0;
	while (i < t.length) {
		if (
			t[i].text === '.' &&
			i > 0 &&
			i < t.length - 1 &&
			t[i - 1].isIdentify &&
			t[i + 1].isIdentify
		) {
			t.splice(i - 1, 3, {
				line: t[i - 1].line,
				column: t[i - 1].line,
				text: t[i - 1].text + t[i].text + t[i + 1].text,
				start: t[i - 1].start,
				stop: t[i + 1].stop,
				type: t[i - 1].type,
				isWhiteSpace: false,
				isIdentify: true
			});
		}
		i++;
	}

	return t;
};

export const completionService: CompletionService = async function (
	model,
	_position,
	_completionContext,
	suggestions,
	_entities,
	snippets
) {
	if (!suggestions) {
		return Promise.resolve([]);
	}
	const languageId = model.getLanguageId();

	const haveCatalog = haveCatalogSQLType(languageId);
	const getDBOrSchema = namedSchemaSQLType(languageId) ? getSchemas : getDataBases;

	const { keywords, syntax } = suggestions;

	const keywordsCompletionItems: ICompletionItem[] = keywords.map((kw) => ({
		label: kw,
		kind: languages.CompletionItemKind.Keyword,
		detail: '关键字',
		sortText: '2' + kw
	}));

	let syntaxCompletionItems: ICompletionItem[] = [];

	/** 是否已经存在 catalog 补全项 */
	let existCatalogCompletions = false;
	/** 是否已经存在 database 补全项 tmpDatabase */
	let existDatabaseCompletions = false;
	/** 是否已经存在 database 补全项 */
	let existDatabaseInCatCompletions = false;
	/** 是否已经存在 table 补全项 tmpTable */
	let existTableCompletions = false;
	/** 是否已经存在 tableInDb 补全项 （cat.db.table） */
	let existTableInDbCompletions = false;
	/** 是否已经存在 view 补全项 tmpDb */
	let existViewCompletions = false;
	/** 是否已经存在 viewInDb 补全项  */
	let existViewInDbCompletions = false;

	for (let i = 0; i < syntax.length; i++) {
		const { syntaxContextType, wordRanges } = syntax[i];

		// e.g. words -> ['cat', '.', 'database', '.', 'table']
		const words = wordRanges.map((wr) => wr.text);
		const wordCount = words.length;

		if (
			syntaxContextType === EntityContextType.CATALOG ||
			syntaxContextType === EntityContextType.DATABASE_CREATE
		) {
			if (!existCatalogCompletions && wordCount <= 1) {
				syntaxCompletionItems = syntaxCompletionItems.concat(await getCatalogs(languageId));
				existCatalogCompletions = true;
			}
		}

		if (
			syntaxContextType === EntityContextType.DATABASE ||
			syntaxContextType === EntityContextType.TABLE_CREATE ||
			syntaxContextType === EntityContextType.VIEW_CREATE
		) {
			if (!existCatalogCompletions && haveCatalog && wordCount <= 1) {
				syntaxCompletionItems = syntaxCompletionItems.concat(await getCatalogs(languageId));
				existCatalogCompletions = true;
			}

			if (!existDatabaseCompletions && wordCount <= 1) {
				syntaxCompletionItems = syntaxCompletionItems.concat(
					await getDBOrSchema(languageId)
				);
				existDatabaseCompletions = true;
			}
			if (!existDatabaseInCatCompletions && haveCatalog && wordCount >= 2 && wordCount <= 3) {
				syntaxCompletionItems = syntaxCompletionItems.concat(
					await getDBOrSchema(languageId, words[0])
				);
				existDatabaseInCatCompletions = true;
			}
		}

		if (syntaxContextType === EntityContextType.TABLE) {
			if (wordCount <= 1) {
				if (!existCatalogCompletions && haveCatalog) {
					const ctas = await getCatalogs(languageId);
					syntaxCompletionItems = syntaxCompletionItems.concat(ctas);
					existCatalogCompletions = true;
				}

				if (!existDatabaseCompletions) {
					syntaxCompletionItems = syntaxCompletionItems.concat(
						await getDBOrSchema(languageId)
					);
					existDatabaseCompletions = true;
				}

				if (!existTableCompletions) {
					syntaxCompletionItems = syntaxCompletionItems.concat(
						await getTables(languageId)
					);
					existTableCompletions = true;
				}
			} else if (wordCount >= 2 && wordCount <= 3) {
				if (!existDatabaseInCatCompletions && haveCatalog) {
					syntaxCompletionItems = syntaxCompletionItems.concat(
						await getDBOrSchema(languageId, words[0])
					);
					existDatabaseInCatCompletions = true;
				}

				if (!existTableInDbCompletions) {
					syntaxCompletionItems = syntaxCompletionItems.concat(
						await getTables(languageId, undefined, words[0])
					);
					existTableInDbCompletions = true;
				}
			} else if (wordCount >= 4 && wordCount <= 5) {
				if (!existTableInDbCompletions) {
					syntaxCompletionItems = syntaxCompletionItems.concat(
						await getTables(languageId, words[0], words[2])
					);
					existTableInDbCompletions = true;
				}
			}
		}

		if (syntaxContextType === EntityContextType.VIEW) {
			if (wordCount <= 1) {
				if (!existCatalogCompletions && haveCatalog) {
					syntaxCompletionItems = syntaxCompletionItems.concat(
						await getCatalogs(languageId)
					);
					existCatalogCompletions = true;
				}

				if (!existDatabaseCompletions) {
					syntaxCompletionItems = syntaxCompletionItems.concat(
						await getDBOrSchema(languageId)
					);
					existDatabaseCompletions = true;
				}

				if (!existViewCompletions) {
					syntaxCompletionItems = syntaxCompletionItems.concat(
						await getViews(languageId)
					);
					existViewCompletions = true;
				}
			} else if (wordCount >= 2 && wordCount <= 3) {
				if (!existDatabaseInCatCompletions && haveCatalog) {
					syntaxCompletionItems = syntaxCompletionItems.concat(
						await getDBOrSchema(languageId, words[0])
					);
					existDatabaseInCatCompletions = true;
				}

				if (!existViewInDbCompletions) {
					syntaxCompletionItems = syntaxCompletionItems.concat(
						await getViews(languageId, undefined, words[0])
					);
					existViewInDbCompletions = true;
				}
			} else if (wordCount >= 4 && wordCount <= 5) {
				if (!existViewInDbCompletions) {
					syntaxCompletionItems = syntaxCompletionItems.concat(
						await getViews(languageId, words[0], words[2])
					);
					existViewInDbCompletions = true;
				}
			}
		}
	}

	const snippetCompletionItems: any = snippets?.map((item) => ({
		label: item.label || item.prefix,
		kind: languages.CompletionItemKind.Snippet,
		filterText: item.prefix,
		insertText: item.insertText,
		insertTextRules: languages.CompletionItemInsertTextRule.InsertAsSnippet,
		sortText: '1' + item.prefix,
		detail: 'SQL模板'
	}));

	return [...syntaxCompletionItems, ...keywordsCompletionItems, ...snippetCompletionItems];
};

export const inlineCompletionService = async function (
	_model: editor.IModel,
	_position: Position,
	mininumCode: string,
	codeTokens: any,
	allSnippetsTokens: any
): Promise<languages.InlineCompletions<languages.InlineCompletion> | null | undefined> {
	let results = [];
	const filteredTokens = filterTokens(codeTokens);

	console.log('tokens: ', filteredTokens);

	// sql语句与解析出的token结尾不一致，当做解析失败处理。末尾为单个引号时dt-sql-parser不会解析出引号的token
	if (
		filteredTokens.length > 0 &&
		!mininumCode.trimEnd().endsWith(filteredTokens[filteredTokens.length - 1].text)
	)
		return { items: [] };

	const snippetsTokenList = allSnippetsTokens.map((item: any) => ({
		...item,
		tokens: filterTokens(item.tokens)
	}));

	for (const snippetTokenInfo of snippetsTokenList) {
		const inlineCompletionText = getInlineCompletionText(
			mininumCode,
			snippetTokenInfo.snippetText,
			filteredTokens,
			snippetTokenInfo.tokens
		);
		if (inlineCompletionText) {
			results.push(inlineCompletionText);
		}
	}

	console.log('补全结果: ', results);

	const inlineCompeletionItems = results.map((item) => ({
		text: item
	}));

	return {
		items: inlineCompeletionItems
	};
};
