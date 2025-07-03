import { IRange } from 'monaco-editor/esm/vs/editor/editor.api';
import { PromptScenario } from './promptSystem';

/**
 * AI模型服务
 */
export enum AIModelType {
	DEEPSEEK = 'deepseek',
	QWEN = 'qwen'
}

/**
 * AI场景特定的API配置
 */
export interface ScenarioAPIConfig {
	/** 端点URL */
	endpoint?: string;
	/** 模型名称 */
	model?: string;
	/** 温度参数 */
	temperature?: number;
	/** 最大token数 */
	maxTokens?: number;
	/** 是否使用聊天模式 */
	useChatMode?: boolean;
}

/**
 * AI模型配置
 */
export interface AIModelConfig {
	type: AIModelType;
	apiKey: string;
	/** 默认配置 */
	defaultConfig?: {
		model?: string;
		endpoint?: string;
		temperature?: number;
		maxTokens?: number;
	};
	/** 不同场景的特定配置 */
	scenarioConfigs?: Partial<Record<PromptScenario, ScenarioAPIConfig>>;
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
 * 模型参数
 */
export interface ModelParams {
	temperature: number;
	maxTokens: number;
	model: string;
	useChatMode: boolean;
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
