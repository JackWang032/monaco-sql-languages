/**
 * 提示词场景类型
 */
export enum PromptScenario {
	/** 语法补全 - Fill In Middle */
	SYNTAX_COMPLETION = 'syntax_completion',
	/** 快速代码生成 */
	CODE_GENERATION = 'code_generation',
	/** 代码解释 */
	CODE_EXPLANATION = 'code_explanation',
	/** 代码优化 */
	CODE_OPTIMIZATION = 'code_optimization',
	/** 错误修复 */
	ERROR_FIXING = 'error_fixing'
}

/**
 * 上下文信息
 */
export interface PromptContext {
	/** 当前语言ID */
	languageId: string;
	/** 光标前的代码 */
	prefix?: string;
	/** 光标后的代码 */
	suffix?: string;
	/** 当前文件完整代码 */
	fullCode?: string;
	/** 当前打开的文件名 */
	activeFile?: string;
	/** 用户输入的提示 */
	userPrompt?: string;
	/** 选中的代码 */
	selectedCode?: string;
	/** 错误信息 */
	errorMessage?: string;
	/** 额外的上下文信息, 暂时没用 */
	metadata?: Record<string, any>;
}

/**
 * 提示词模板配置
 */
export interface PromptTemplate {
	/** 模板ID */
	id: string;
	/** 场景类型 */
	scenario: PromptScenario;
	/** 模板标题 */
	title: string;
	/** 模板描述 */
	description: string;
	/** 系统提示词模板 */
	systemPromptTemplate: string;
	/** 用户提示词模板 */
	userPromptTemplate: string;
	/** 温度参数 */
	temperature?: number;
	/** 最大token数 */
	maxTokens?: number;
}

/**
 * SQL语言特定变量
 */
export interface SQLLanguageVariables {
	/** 语言名称 */
	languageName: string;
	/** 语言特色描述 */
	languageFeatures: string;
	/** 特殊语法注意事项 */
	syntaxNotes: string;
	/** 性能优化要点 */
	performanceTips: string;
}

/**
 * SQL语言配置映射
 */
export const SQL_LANGUAGE_CONFIG: Record<string, SQLLanguageVariables> = {
	mysql: {
		languageName: 'MySQL',
		languageFeatures: 'MySQL数据库语法，支持存储引擎、触发器、存储过程等特性',
		syntaxNotes: '注意MySQL特有的反引号标识符、LIMIT语法、AUTO_INCREMENT等',
		performanceTips: '考虑索引优化、查询缓存、分区表等MySQL性能特性'
	},
	pgsql: {
		languageName: 'PostgreSQL',
		languageFeatures: 'PostgreSQL数据库语法，支持数组、JSON、全文搜索、窗口函数等高级特性',
		syntaxNotes: '注意PostgreSQL的双引号标识符、SERIAL类型、RETURNING子句等',
		performanceTips: '考虑VACUUM、ANALYZE、部分索引、表分区等PostgreSQL优化技术'
	},
	spark: {
		languageName: 'Spark SQL',
		languageFeatures: 'Apache Spark SQL语法，面向大数据分布式计算',
		syntaxNotes: '注意分布式计算特性、Catalyst优化器、DataFrame API兼容性',
		performanceTips: '考虑数据分区、缓存策略、广播变量、避免shuffle操作'
	},
	hive: {
		languageName: 'Hive SQL',
		languageFeatures: 'Apache Hive HiveQL语法，面向数据仓库和批处理',
		syntaxNotes: '注意分区表、桶表、SerDe、UDF等Hive特性',
		performanceTips: '考虑分区策略、列式存储格式（Parquet/ORC）、压缩算法'
	},
	flink: {
		languageName: 'Flink SQL',
		languageFeatures: 'Apache Flink SQL语法，面向流式处理和实时计算',
		syntaxNotes: '注意事件时间、水位线、窗口函数、状态管理等流式特性',
		performanceTips: '考虑并行度设置、状态后端、检查点策略、反压处理'
	},
	impala: {
		languageName: 'Impala SQL',
		languageFeatures: 'Cloudera Impala SQL语法，面向交互式分析查询',
		syntaxNotes: '注意内存计算特性、与Hive元数据兼容性、文件格式支持',
		performanceTips: '考虑统计信息收集、列式存储、分区剪枝、连接顺序优化'
	},
	trino: {
		languageName: 'Trino SQL',
		languageFeatures: 'Trino (原Presto) SQL语法，面向分布式查询引擎',
		syntaxNotes: '注意跨数据源查询、连接器机制、内存管理',
		performanceTips: '考虑连接器配置、查询并行度、内存调优、谓词下推'
	}
};

/**
 * 预定义的提示词模板
 */
export const PROMPT_TEMPLATES: Record<PromptScenario, PromptTemplate> = {
	[PromptScenario.SYNTAX_COMPLETION]: {
		id: 'syntax_completion',
		scenario: PromptScenario.SYNTAX_COMPLETION,
		title: 'SQL语法补全',
		description: '基于上下文进行智能的SQL语法补全',
		systemPromptTemplate: ``,
		// qwen 的补全格式
		userPromptTemplate: `<|fim_prefix|>{prefix}<|fim_suffix|>{suffix}<|fim_middle|>`,
		temperature: 0.2,
		maxTokens: 256
	},

	[PromptScenario.CODE_GENERATION]: {
		id: 'code_generation',
		scenario: PromptScenario.CODE_GENERATION,
		title: 'SQL代码生成',
		description: '根据需求描述生成相应的SQL代码',
		systemPromptTemplate: `你是{languageName}数据库专家。根据用户需求生成高质量的{languageName}代码。

语言特性：{languageFeatures}

生成要求：
1. 严格遵循{languageName}语法规范
2. {syntaxNotes}
3. 生成完整、可执行的SQL语句
4. {performanceTips}
5. 考虑代码的可读性和维护性
6. 回答不要包含任何对话解释内容
7. 保持缩进与参考代码一致`,
		userPromptTemplate: `用户需求：{userPrompt}

参考代码：
\`\`\`sql
{selectedCode}
\`\`\`

请生成符合需求的{languageName}代码：`,
		temperature: 0.3,
		maxTokens: 512
	},

	[PromptScenario.CODE_EXPLANATION]: {
		id: 'code_explanation',
		scenario: PromptScenario.CODE_EXPLANATION,
		title: '代码解释',
		description: '详细解释SQL代码的功能和逻辑',
		systemPromptTemplate: `你是{languageName}数据库专家。请清晰、准确地解释用户提供的SQL代码。

语言特性：{languageFeatures}

解释要求：
1. 解释代码的整体目的和业务逻辑
2. 逐步分析重要的SQL子句和函数
3. 指出{languageName}特有的语法和特性
4. 分析潜在的性能影响和优化空间
5. 使用简洁明了的中文进行解释
6. 如果代码有问题，请指出并给出建议`,
		userPromptTemplate: `请解释以下{languageName}代码：

\`\`\`sql
{selectedCode}
\`\`\`

特别关注：{userPrompt}

请详细解释这段代码的功能和特点：`,
		temperature: 0.4,
		maxTokens: 1024
	},

	[PromptScenario.CODE_OPTIMIZATION]: {
		id: 'code_optimization',
		scenario: PromptScenario.CODE_OPTIMIZATION,
		title: '代码优化',
		description: '优化SQL代码的性能和可读性',
		systemPromptTemplate: `你是{languageName}性能优化专家。请分析并优化用户提供的SQL代码。

语言特性：{languageFeatures}
优化重点：{performanceTips}

优化要求：
1. 分析现有代码的性能瓶颈和问题
2. 提供具体的{languageName}优化策略
3. 重写优化后的完整代码
4. 详细解释优化的原理和预期效果
5. 考虑{languageName}特有的优化技术
6. 确保优化后代码的正确性和可维护性`,
		userPromptTemplate: `请优化以下{languageName}代码：

\`\`\`sql
{selectedCode}
\`\`\`

优化需求：{userPrompt}

请提供优化分析和改进后的代码：`,
		temperature: 0.3,
		maxTokens: 1024
	},

	[PromptScenario.ERROR_FIXING]: {
		id: 'error_fixing',
		scenario: PromptScenario.ERROR_FIXING,
		title: '错误修复',
		description: '诊断并修复SQL代码中的错误',
		systemPromptTemplate: `你是{languageName}调试专家。请分析并修复用户提供的有错误的SQL代码。

语言特性：{languageFeatures}
语法注意：{syntaxNotes}

修复要求：
1. 准确识别错误类型、原因和位置
2. 解释错误在{languageName}中的具体含义
3. 提供正确的代码修复方案
4. 确保修复后的代码语法正确且逻辑合理
5. 如果有多种修复方式，提供最佳实践方案
6. 预防类似错误的编码建议`,
		userPromptTemplate: `以下{languageName}代码出现错误：

\`\`\`sql
{selectedCode}
\`\`\`

错误信息：{errorMessage}
补充说明：{userPrompt}

请诊断并修复这个错误：`,
		temperature: 0.2,
		maxTokens: 1024
	}
};

/**
 * 提示词管理
 */
export class PromptSystemManager {
	private static instance: PromptSystemManager;

	private constructor() {}

	public static getInstance(): PromptSystemManager {
		if (!PromptSystemManager.instance) {
			PromptSystemManager.instance = new PromptSystemManager();
		}
		return PromptSystemManager.instance;
	}

	/**
	 * 获取指定场景的提示词模板
	 */
	public getTemplate(scenario: PromptScenario): PromptTemplate {
		return PROMPT_TEMPLATES[scenario];
	}

	/**
	 * 处理提示词模板，替换所有变量
	 */
	public processPrompt(
		scenario: PromptScenario,
		context: PromptContext
	): {
		systemPrompt: string;
		userPrompt: string;
		temperature?: number;
		maxTokens?: number;
	} {
		const template = this.getTemplate(scenario);
		const languageConfig = SQL_LANGUAGE_CONFIG[context.languageId] || {
			languageName: context.languageId.toUpperCase(),
			languageFeatures: `${context.languageId}数据库语法`,
			syntaxNotes: `遵循${context.languageId}标准语法规范`,
			performanceTips: '考虑查询性能和最佳实践'
		};

		// 构建变量映射
		const variables = {
			'{languageId}': context.languageId,
			'{languageName}': languageConfig.languageName,
			'{languageFeatures}': languageConfig.languageFeatures,
			'{syntaxNotes}': languageConfig.syntaxNotes,
			'{performanceTips}': languageConfig.performanceTips,
			'{prefix}': context.prefix || '',
			'{suffix}': context.suffix || '',
			'{userPrompt}': context.userPrompt || '',
			'{selectedCode}': context.selectedCode || '',
			'{errorMessage}': context.errorMessage || ''
		};

		// 替换模板中的变量
		let systemPrompt = template.systemPromptTemplate;
		let userPrompt = template.userPromptTemplate;

		Object.entries(variables).forEach(([placeholder, value]) => {
			const regex = new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g');
			systemPrompt = systemPrompt.replace(regex, value);
			userPrompt = userPrompt.replace(regex, value);
		});

		// 清理空白内容
		userPrompt = this.cleanEmptyContent(userPrompt);

		return {
			systemPrompt,
			userPrompt,
			temperature: template.temperature,
			maxTokens: template.maxTokens
		};
	}

	/**
	 * 清理模板中的空白内容
	 */
	private cleanEmptyContent(template: string): string {
		// 移除空的参考代码块
		template = template.replace(/参考代码：\s*```sql\s*```/g, '');
		// 移除空的特别关注行
		template = template.replace(/特别关注：\s*$/gm, '');
		// 移除空的优化需求行
		template = template.replace(/优化需求：\s*$/gm, '');
		// 移除空的错误信息行
		template = template.replace(/错误信息：\s*$/gm, '');
		// 移除空的补充说明行
		template = template.replace(/补充说明：\s*$/gm, '');
		// 移除空的转换要求行
		template = template.replace(/转换要求：\s*$/gm, '');
		// 移除空的相关代码块
		template = template.replace(/相关代码：\s*```sql\s*```/g, '');
		// 移除多余的空行
		template = template.replace(/\n\s*\n\s*\n/g, '\n\n');

		return template.trim();
	}

	/**
	 * 获取所有可用的场景
	 */
	public getAvailableScenarios(): PromptScenario[] {
		return Object.values(PromptScenario);
	}
}

export const getPromptSystemManager = (): PromptSystemManager => {
	return PromptSystemManager.getInstance();
};
