import { languages } from 'monaco-editor/esm/vs/editor/editor.api';
import { AIModelConfig, CacheItem } from './types';

/**
 * AI补全配置存储
 */
export class AICompletionConfigManager {
	private static instance: AICompletionConfigManager;
	private config: AIModelConfig | null = null;
	private isEnabled: boolean = false;
	private cache: Record<string, CacheItem> = {};
	private cacheExpiration: number = 60000; // 缓存过期时间，默认60秒
	private debounceTimeout: number | null = null;
	private debounceDelay: number = 400; // 增加延迟时间
	private pendingRequestCount: number = 0; // 请求计数器

	private constructor() {}

	public static getInstance(): AICompletionConfigManager {
		if (!AICompletionConfigManager.instance) {
			AICompletionConfigManager.instance = new AICompletionConfigManager();
		}
		return AICompletionConfigManager.instance;
	}

	public getConfig(): AIModelConfig | null {
		return this.config;
	}

	public setConfig(config: AIModelConfig): void {
		this.config = config;
	}

	public getEnabled(): boolean {
		return this.isEnabled;
	}

	public setEnabled(enabled: boolean): void {
		this.isEnabled = enabled;
	}

	/**
	 * 设置防抖延迟时间
	 * @param delay 延迟时间（毫秒）
	 */
	public setDebounceDelay(delay: number): void {
		this.debounceDelay = delay;
	}

	/**
	 * 使用防抖执行函数
	 * @param fn 要执行的函数
	 * @returns 如果函数被安排执行，返回true；如果被防抖取消，返回false
	 */
	public debounce<T extends any[]>(fn: (...args: T) => void, ...args: T): boolean {
		// 清除之前的防抖定时器
		if (this.debounceTimeout !== null) {
			clearTimeout(this.debounceTimeout);
			this.debounceTimeout = null;
		}

		// 检查是否已有请求正在处理，如果有则增加计数器
		this.pendingRequestCount++;
		const currentRequestId = this.pendingRequestCount;

		// 设置新的防抖定时器
		this.debounceTimeout = window.setTimeout(() => {
			// 只有当当前请求是最后一个请求时才执行
			if (currentRequestId === this.pendingRequestCount) {
				fn(...args);
				this.pendingRequestCount = 0; // 重置计数器
			} else {
				console.log(
					`跳过请求 #${currentRequestId}，因为有更新的请求 #${this.pendingRequestCount}`
				);
			}
			this.debounceTimeout = null;
		}, this.debounceDelay);

		return true;
	}

	/**
	 * 缓存请求结果
	 * @param key 缓存键
	 * @param result 请求结果
	 */
	public cacheResult(key: string, result: languages.InlineCompletion[]): void {
		this.cache[key] = {
			timestamp: Date.now(),
			result: [...result]
		};
	}

	/**
	 * 获取缓存的请求结果
	 * @param key 缓存键
	 * @returns 如果存在有效缓存，返回缓存结果；否则返回null
	 */
	public getCachedResult(key: string): languages.InlineCompletion[] | null {
		const cached = this.cache[key];
		if (cached && Date.now() - cached.timestamp < this.cacheExpiration) {
			return [...(cached.result as languages.InlineCompletion[])];
		}
		return null;
	}

	/**
	 * 清除所有缓存
	 */
	public clearCache(): void {
		this.cache = {};
	}

	/**
	 * 从本地存储加载配置
	 */
	public loadConfig(): void {
		try {
			const savedConfig = localStorage.getItem('aiCompletionConfig');
			if (savedConfig) {
				this.config = JSON.parse(savedConfig);
			}

			const enabledState = localStorage.getItem('aiCompletionEnabled');
			this.isEnabled = enabledState ? enabledState === 'true' : false;
		} catch (e) {
			console.error('加载AI补全配置失败', e);
		}
	}

	/**
	 * 保存配置到本地存储
	 */
	public saveConfig(): void {
		try {
			if (this.config) {
				localStorage.setItem('aiCompletionConfig', JSON.stringify(this.config));
			}
			localStorage.setItem('aiCompletionEnabled', String(this.isEnabled));
		} catch (e) {
			console.error('保存AI补全配置失败', e);
		}
	}
}

/**
 * 获取AI补全配置管理器实例
 */
export const getAICompletionConfigManager = (): AICompletionConfigManager => {
	return AICompletionConfigManager.getInstance();
};
