import 'monaco-sql-languages/esm/all.contributions.js';
import './languageWorker';
import './theme';
import { setupLanguageFeatures, LanguageIdEnum } from 'monaco-sql-languages/esm/main.js';

import { completionService, inlineCompletionService } from './helpers/completionService';

/**
 * replace dtstack custom params, eg: @@{componentParams}, ${taskCustomParams}
 * @param code editor value
 * @returns replaced string
 */
const preprocessCode = (code: string): string => {
	const regex1 = /@@{[A-Za-z0-9._-]*}/g;
	const regex2 = /\${[A-Za-z0-9._-]*}/g;
	let result = code;

	if (regex1.test(code)) {
		result = result.replace(regex1, (str) => {
			return str.replace(/@|{|}|\.|-/g, '_');
		});
	}
	if (regex2.test(code)) {
		result = result.replace(regex2, (str) => {
			return str.replace(/\$|{|}|\.|-/g, '_');
		});
	}
	return result;
};

/**
 * replace dtstack custom grammar, eg: @@{componentParams}, ${taskCustomParams}
 * @param code editor value
 * @param mark some sql grammar need special mark to replace the beginning and the end
 * @returns replaced string
 */
const preprocessCodeHive = (code: string, mark?: string): string => {
	const regex1 = /@@{[A-Za-z0-9._-]*}/g;
	const regex2 = /\${[A-Za-z0-9._-]*}/g;
	let result = code;

	if (regex1.test(code)) {
		result = result.replace(regex1, (str) => {
			if (mark) {
				return str
					.replace(/@/, mark)
					.replace(/}/, mark)
					.replace(/@|{|\.|-/g, '_');
			}
			return str.replace(/@|{|}|\.|-/g, '_');
		});
	}
	if (regex2.test(code)) {
		result = result.replace(regex2, (str) => {
			if (mark) {
				return str.replace(/\$|}/g, mark).replace(/{|\.|-/g, '_');
			}
			return str.replace(/\$|{|}|\.|-/g, '_');
		});
	}
	return result;
};

setupLanguageFeatures(LanguageIdEnum.FLINK, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});

setupLanguageFeatures(LanguageIdEnum.SPARK, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});

setupLanguageFeatures(LanguageIdEnum.HIVE, {
	completionItems: {
		enable: true,
		completionService,
		snippets: [
			{
				prefix: 'INSERT',
				label: 'INSERT 默认模板',
				body: ['insert', 'into', '    `${1:table1}`', 'values', '    (`$2`);', '${3}']
			},
			{
				prefix: 'INSERTCASE',
				label: 'INSERT CASE模板',
				body: `INSERT INTO table_name PARTITION (country, state)
SELECT col1, col2, country, state
FROM (
    SELECT col1, col2,
        CASE
            WHEN country = 'USA' THEN 'United States'
            ELSE country
        END AS country,
        CASE
            WHEN country = 'USA' THEN 'NA'
            ELSE state
        END AS state
    FROM source_table
) subquery;`
			},
			{
				prefix: 'SELECT',
				label: 'SELECT 默认模板',
				body: ['select', '	${1:id}', 'from', '	${2:table1};', '${3}']
			}
		]
	},
	inlineCompletionItems: {
		enable: true,
		completionService: inlineCompletionService,
		inlineSnippets: [
			'SELECT id FROM table1 WHERE id = ``',
			'CREATE TABLE temp_identify AS SELECT temp_identify FROM table1',
			'CREATE TABLE a1 (id INT, name VARCHAR(255))',
			'CREATE TABLE IF NOT EXISTS temp_identify AS SELECT id FROM table1;',
			'ALTER TABLE temp_identify RENAME TO tb2;',
			'SELECT id, name FROM t2;',
			`CREATE CONNECTOR temp_identify \nTYPE 'postgres' \nURL 'jdbc:postgresql://localhost:5432' \nCOMMENT '这是一个 postgres 连接器';`,
			`CREATE FUNCTION test_udf
AS "com.BaseFieldUDF"
USING JAR 'hdfs://hadoop12:9000/user/hive/jars/hivetestfunc-1.0-SNAPSHOT.jar'
, FILE 'hdfs://hadoop12:9000/user/hive/files/hivetestfunc.java'
, ARCHIVE 'hdfs://hadoop12:9000/user/hive/files/hivetestfunc.txt'
`,
			`CREATE EXTERNAL TABLE mydb.ext_table(
    id INT,
    name STRING,
    hobby ARRAY < STRING >,
    add
        MAP < STRING,
        STRING >
) ROW FORMAT DELIMITED FIELDS TERMINATED BY ',' COLLECTION ITEMS TERMINATED BY '-' MAP KEYS TERMINATED BY ':' LOCATION '/user/mydb/ext_table' TBLPROPERTIES('author' = 'hayden', 'desc' = '一个外部测试表');
`
		]
	},
	preprocessCode: (code: string) => preprocessCodeHive(code, '`')
});

setupLanguageFeatures(LanguageIdEnum.MYSQL, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});

setupLanguageFeatures(LanguageIdEnum.TRINO, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});

setupLanguageFeatures(LanguageIdEnum.PG, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});

setupLanguageFeatures(LanguageIdEnum.IMPALA, {
	completionItems: {
		enable: true,
		completionService
	},
	preprocessCode
});
