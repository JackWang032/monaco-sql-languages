export const snippets = [
	{
		prefix: 'INSERT',
		label: 'INSERT 默认模板',
		body: ['insert', 'into', '    `${1:table1}`', 'values', '    (`$2`);', '${3}']
	},
	{
		prefix: 'SELECT',
		label: 'SELECT 默认模板',
		body: ['select', '	${1:id}', 'from', '	${2:table1};', '${3}']
	}
];
