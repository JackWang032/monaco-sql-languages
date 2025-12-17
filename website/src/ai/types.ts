import { IRange } from 'monaco-editor/esm/vs/editor/editor.api';

/**
 * AI模型服务
 */
export enum AIModelType {
	DEEPSEEK = 'deepseek',
	QWEN = 'qwen'
}

/**
 * AI模型配置
 */
export interface AIModelConfig {
	type: AIModelType;
	apiKey: string;
	model: string;
	endpoint: string;
}

/**
 * 代码生成Widget的状态
 */
export interface CodeGenerationWidgetState {
	/** 是否可见 */
	isVisible: boolean;
	/** 编辑器位置（行号和列号） */
	position: { lineNumber: number; column: number } | null;
	/** 选中的代码范围（用于替换） */
	selectionRange: IRange | null;
	/** 用户输入的提示文本 */
	prompt: string;
	/** 是否正在生成代码 */
	isGenerating: boolean;
	/** 生成的代码 */
	generatedCode: string | null;
}

/**
 * 流式生成代码的回调函数类型
 */
export interface StreamingCodeCallback {
	onProgress: (partialCode: string, isComplete: boolean) => void;
	onError?: (error: Error) => void;
}

/**
 * 缓存项接口
 */
export interface CacheItem {
	timestamp: number;
	result: any;
}

export enum DiffLineType {
	UNCHANGED = 'unchanged',
	ADDED = 'added',
	DELETED = 'deleted'
}

export interface DiffLine {
	type: DiffLineType;
	originalLineNumber?: number; // 原始行号
	newLineNumber?: number; // 新行号
	content: string; // 行内容
}
