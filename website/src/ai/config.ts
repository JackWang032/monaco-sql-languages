import { AIModelConfig } from './types';

/**
 * AI配置
 */
export class AIConfigManager {
	private static instance: AIConfigManager;
	private config: AIModelConfig | null = null;
	private isEnabled: boolean = false;

	private constructor() {}

	public static getInstance(): AIConfigManager {
		if (!AIConfigManager.instance) {
			AIConfigManager.instance = new AIConfigManager();
		}
		return AIConfigManager.instance;
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
export const getAIConfigManager = (): AIConfigManager => {
	return AIConfigManager.getInstance();
};
