import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';

const program = new Command();

const log = {
	info: (msg: string) => console.log(chalk.blue('[INFO]'), msg),
	success: (msg: string) => console.log(chalk.green('[SUCCESS]'), msg),
	warning: (msg: string) => console.log(chalk.yellow('[WARNING]'), msg),
	error: (msg: string) => console.log(chalk.red('[ERROR]'), msg),
};

type StorageBackend = 'd1' | 'kv' | 'hybrid';
type MissingResourcePolicy = 'ask' | 'auto' | 'manual' | 'fail';

interface DeployCommandOptions {
	env?: string;
	storage?: string;
	apiKey?: string;
	missingResource?: string;
	skipMigrate?: boolean;
	skipBuild?: boolean;
	skipHealthcheck?: boolean;
	yes?: boolean;
	nonInteractive?: boolean;
}

interface ResolvedDeployOptions {
	environment: string;
	storageBackend: StorageBackend;
	apiKey: string;
	missingResourcePolicy: MissingResourcePolicy;
	skipMigrate: boolean;
	skipBuild: boolean;
	skipHealthcheck: boolean;
	yes: boolean;
	nonInteractive: boolean;
}

interface WranglerConfig {
	name: string;
	main: string;
	compatibility_date: string;
	compatibility_flags: string[];
	build: { command: string; watch_dir: string };
	vars: Record<string, any>;
	d1_databases: D1Binding[];
	kv_namespaces: KVBinding[];
	r2_buckets: R2Binding[];
	queues: QueueBinding[];
	durable_objects: DOBinding[];
	hyperdrive: HyperdriveBinding[];
	ai: AIBinding[];
	deploy_options: DeployOptions;
	environments: Record<string, EnvironmentConfig>;
}

interface D1Binding {
	binding: string;
	database_name: string;
	database_id?: string;
	preview_id?: string;
	migrations_dir?: string;
}

interface KVBinding {
	binding: string;
	id?: string;
	preview_id?: string;
}

interface R2Binding {
	binding: string;
	bucket_name: string;
	jurisdiction?: string;
}

interface QueueBinding {
	binding: string;
	queue_name: string;
}

interface DOBinding {
	binding: string;
	class_name: string;
}

interface HyperdriveBinding {
	binding: string;
	id: string;
}

interface AIBinding {
	binding: string;
}

interface DeployOptions {
	auto_migrate: boolean;
	migrations_dir: string;
	verify_deployment: boolean;
	pre_deploy_hooks?: string[];
	post_deploy_hooks?: string[];
}

interface EnvironmentConfig {
	name: string;
	workers_dev?: boolean;
	vars?: Record<string, any>;
	assets?: {
		directory: string;
		binding: string;
		run_worker_first?: boolean;
	};
}

interface ResourceInfo {
	type: string;
	binding: string;
	id: string;
	status: 'existing' | 'created' | 'pending';
}

interface DeployState {
	schema_version: string;
	project: string;
	last_deployed: string;
	environments: Record<string, EnvironmentState>;
}

interface EnvironmentState {
	worker_name: string;
	version_id: string;
	deployed_at: string;
	storage_backend: StorageBackend;
	resources: ResourceInfo[];
}

function getProjectRoot(): string {
	return process.cwd();
}

function getStatePath(): string {
	return path.join(getProjectRoot(), '.wrangler', 'deploy', 'state.json');
}

function getWranglerCommand(): string {
	return 'npx wrangler';
}

function getCommandOutput(command: string, timeout = 30000): string {
	return execSync(command, {
		cwd: getProjectRoot(),
		encoding: 'utf8',
		timeout,
	});
}

function normalizeEnvironmentName(value?: string): string | undefined {
	return value?.trim() || undefined;
}

function normalizeStorageBackend(value?: string): StorageBackend | undefined {
	if (!value) return undefined;
	if (value === 'd1' || value === 'kv' || value === 'hybrid') return value;
	return undefined;
}

function normalizeMissingResourcePolicy(value?: string): MissingResourcePolicy | undefined {
	if (!value) return undefined;
	if (value === 'ask' || value === 'auto' || value === 'manual' || value === 'fail') return value;
	return undefined;
}

function ensureInteractiveAllowed(nonInteractive: boolean, message: string): void {
	if (nonInteractive) {
		throw new Error(message);
	}
}

function parseWranglerToml(): WranglerConfig {
	const configPath = path.join(getProjectRoot(), 'wrangler.toml');
	const content = fs.readFileSync(configPath, 'utf8');

	const config: WranglerConfig = {
		name: '',
		main: 'dist/index.js',
		compatibility_date: '2024-05-02',
		compatibility_flags: ['nodejs_compat'],
		build: { command: 'npm run build', watch_dir: './src' },
		vars: {},
		d1_databases: [],
		kv_namespaces: [],
		r2_buckets: [],
		queues: [],
		durable_objects: [],
		hyperdrive: [],
		ai: [],
		deploy_options: { auto_migrate: true, migrations_dir: './src/database', verify_deployment: true },
		environments: {},
	};

	const patterns: Array<{ key: keyof WranglerConfig; regex: RegExp; parser: (block: string) => any }> = [
		{
			key: 'd1_databases',
			regex: /\[\[d1_databases\]\]([\s\S]*?)(?=\[\[d1_databases\]\]|\n\[)/g,
			parser: (block) => {
				const binding = block.match(/binding\s*=\s*"([^"]+)"/)?.[1];
				const dbName = block.match(/database_name\s*=\s*"([^"]+)"/)?.[1];
				const dbId = block.match(/database_id\s*=\s*"([^"]+)"/)?.[1];
				const previewId = block.match(/preview_id\s*=\s*"([^"]+)"/)?.[1];
				if (binding && dbName) {
					return { binding, database_name: dbName, database_id: dbId, preview_id: previewId };
				}
				return null;
			},
		},
		{
			key: 'kv_namespaces',
			regex: /\[\[kv_namespaces\]\]([\s\S]*?)(?=\[\[kv_namespaces\]\]|\n\[)/g,
			parser: (block) => {
				const binding = block.match(/binding\s*=\s*"([^"]+)"/)?.[1];
				const id = block.match(/id\s*=\s*"([^"]+)"/)?.[1];
				const previewId = block.match(/preview_id\s*=\s*"([^"]+)"/)?.[1];
				if (binding) {
					return { binding, id, preview_id: previewId };
				}
				return null;
			},
		},
		{
			key: 'r2_buckets',
			regex: /\[\[r2_buckets\]\]([\s\S]*?)(?=\[\[r2_buckets\]\]|\n\[)/g,
			parser: (block) => {
				const binding = block.match(/binding\s*=\s*"([^"]+)"/)?.[1];
				const bucketName = block.match(/bucket_name\s*=\s*"([^"]+)"/)?.[1];
				const jurisdiction = block.match(/jurisdiction\s*=\s*"([^"]+)"/)?.[1];
				if (binding && bucketName) {
					return { binding, bucket_name: bucketName, jurisdiction };
				}
				return null;
			},
		},
		{
			key: 'queues',
			regex: /\[\[queues\]\]([\s\S]*?)(?=\[\[queues\]\]|\n\[)/g,
			parser: (block) => {
				const binding = block.match(/binding\s*=\s*"([^"]+)"/)?.[1];
				const queueName = block.match(/queue\s*=\s*"([^"]+)"/)?.[1];
				if (binding && queueName) {
					return { binding, queue_name: queueName };
				}
				return null;
			},
		},
	];

	for (const { key, regex, parser } of patterns) {
		const matches = content.matchAll(regex);
		let match;
		while ((match = matches.next()) && !match.done) {
			const parsed = parser(match.value[1]);
			if (parsed) {
				(config[key] as any[]).push(parsed);
			}
		}
	}

	const simpleFields: Array<{ key: string; regex: RegExp }> = [
		{ key: 'name', regex: /^name\s*=\s*"([^"]+)"/m },
		{ key: 'main', regex: /^main\s*=\s*"([^"]+)"/m },
		{ key: 'compatibility_date', regex: /^compatibility_date\s*=\s*"([^"]+)"/m },
	];

	for (const { key, regex } of simpleFields) {
		const match = content.match(regex);
		if (match) {
			(config as any)[key] = match[1];
		}
	}

	const deployMatch = content.match(/\[deploy\]([\s\S]*?)(?=\n\[|\n$)/);
	if (deployMatch) {
		const autoMigrate = deployMatch[1].match(/auto_migrate\s*=\s*(true|false)/);
		const migrationsDir = deployMatch[1].match(/migrations_dir\s*=\s*"([^"]+)"/);
		const verify = deployMatch[1].match(/verify_deployment\s*=\s*(true|false)/);
		config.deploy_options.auto_migrate = autoMigrate?.[1] === 'true';
		config.deploy_options.migrations_dir = migrationsDir?.[1] || './src/database';
		config.deploy_options.verify_deployment = verify?.[1] !== 'false';
	}

	const envMatches = content.matchAll(/\[env\.(\w+)\]([\s\S]*?)(?=\[env\.|\n\[|\z)/g);
	let envMatch;
	while ((envMatch = envMatches.next()) && !envMatch.done) {
		const match = envMatch.value;
		const envName = match[1];
		const envBlock = match[2];
		const nameMatch = envBlock.match(/name\s*=\s*"([^"]+)"/);
		const workersDevMatch = envBlock.match(/workers_dev\s*=\s*(true|false)/);

		config.environments[envName] = {
			name: nameMatch?.[1] || `${config.name}-${envName}`,
			workers_dev: workersDevMatch?.[1] !== 'false',
		};
	}

	const topLevelAssetsMatch = content.match(/\[assets\]([\s\S]*?)(?=\n\[|$)/);
	if (topLevelAssetsMatch) {
		const assetsBlock = topLevelAssetsMatch[1];
		const assetsDirMatch = assetsBlock.match(/directory\s*=\s*"([^"]+)"/);
		const assetsBindingMatch = assetsBlock.match(/binding\s*=\s*"([^"]+)"/);

		if (assetsDirMatch && assetsBindingMatch) {
			for (const envName of Object.keys(config.environments)) {
				config.environments[envName].assets = {
					directory: assetsDirMatch[1],
					binding: assetsBindingMatch[1],
					run_worker_first: true,
				};
			}
		}
	}

	return config;
}

function loadState(): DeployState | null {
	const statePath = getStatePath();
	if (!fs.existsSync(statePath)) return null;
	try {
		return JSON.parse(fs.readFileSync(statePath, 'utf8'));
	} catch {
		return null;
	}
}

function saveState(state: DeployState): void {
	const statePath = getStatePath();
	const dir = path.dirname(statePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
	log.success(`状态已保存: ${statePath}`);
}

function getLastEnvironment(state: DeployState | null): string | undefined {
	if (!state) return undefined;
	const envEntries = Object.entries(state.environments);
	if (envEntries.length === 0) return undefined;
	return envEntries.sort((a, b) => new Date(b[1].deployed_at).getTime() - new Date(a[1].deployed_at).getTime())[0]?.[0];
}

function checkCommand(command: string): boolean {
	try {
		execSync(`which ${command}`, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

function checkWranglerLogin(): boolean {
	try {
		const result = getCommandOutput(`${getWranglerCommand()} whoami`, 10000);
		if (result.includes('Getting User') || result.includes('email')) {
			return true;
		}
		return result.trim().length > 0;
	} catch {
		return false;
	}
}

function generateSecureApiKey(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
	let key = '';
	const randomValues = new Uint32Array(32);
	crypto.getRandomValues(randomValues);
	for (let i = 0; i < 32; i++) {
		key += chars[randomValues[i] % chars.length];
	}
	return key;
}

function executeCommand(command: string, description: string): Promise<boolean> {
	return new Promise((resolve) => {
		log.info(description);
		log.info(`执行: ${command}`);
		const child = spawn(command, { shell: true, stdio: 'inherit', cwd: getProjectRoot() });
		child.on('close', (code) => {
			if (code === 0) {
				log.success(`${description} 完成`);
				resolve(true);
			} else {
				log.error(`${description} 失败`);
				resolve(false);
			}
		});
		child.on('error', (error) => {
			log.error(`命令执行错误: ${error.message}`);
			resolve(false);
		});
	});
}

function escapeShellArg(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getEnvironmentChoices(config: WranglerConfig): string[] {
	const envs = Object.keys(config.environments);
	return envs.length > 0 ? envs : ['production'];
}

function getWorkerName(config: WranglerConfig, environment: string): string {
	return config.environments[environment]?.name || config.name;
}

function getDefaultEnvironment(config: WranglerConfig, state: DeployState | null): string {
	const environments = getEnvironmentChoices(config);
	const lastEnvironment = getLastEnvironment(state);
	if (lastEnvironment && environments.includes(lastEnvironment)) return lastEnvironment;
	if (environments.includes('development')) return 'development';
	return environments[0];
}

function parseBooleanFlag(value: unknown): boolean {
	return value === true;
}

async function promptMissingResourceAction(resourceLabel: string): Promise<'auto' | 'manual' | 'fail'> {
	const answers = await inquirer.prompt([
		{
			type: 'list',
			name: 'action',
			message: `${resourceLabel} 不存在，如何处理？`,
			choices: [
				{ name: '自动创建', value: 'auto' },
				{ name: '手动选择已有资源', value: 'manual' },
				{ name: '取消部署', value: 'fail' },
			],
			default: 'auto',
		},
	]);
	return answers.action;
}

function resolveEffectiveMissingPolicy(basePolicy: MissingResourcePolicy, yes: boolean): MissingResourcePolicy {
	if (basePolicy === 'ask' && yes) return 'auto';
	return basePolicy;
}

async function resolveEnvironment(config: WranglerConfig, state: DeployState | null, options: DeployCommandOptions): Promise<string> {
	const environments = getEnvironmentChoices(config);
	const explicit = normalizeEnvironmentName(options.env || process.env.DEPLOY_ENV);
	if (explicit) {
		if (!environments.includes(explicit)) {
			throw new Error(`未知环境: ${explicit}，可选值: ${environments.join(', ')}`);
		}
		return explicit;
	}
	ensureInteractiveAllowed(parseBooleanFlag(options.nonInteractive), '缺少 --env，且当前为非交互模式');
	const defaultEnvironment = getDefaultEnvironment(config, state);
	const answers = await inquirer.prompt([
		{ type: 'list', name: 'environment', message: '选择环境:', choices: environments, default: defaultEnvironment },
	]);
	return answers.environment;
}

async function resolveStorageBackend(
	options: DeployCommandOptions,
	state: DeployState | null,
	environment?: string,
): Promise<StorageBackend> {
	const explicit = normalizeStorageBackend(options.storage || process.env.STORAGE_BACKEND);
	if (explicit) return explicit;
	const cached = environment ? state?.environments[environment]?.storage_backend : undefined;
	if (cached) return cached;
	ensureInteractiveAllowed(parseBooleanFlag(options.nonInteractive), '缺少 --storage，且当前为非交互模式');
	const answers = await inquirer.prompt([
		{
			type: 'list',
			name: 'backend',
			message: '选择存储后端:',
			choices: [
				{ name: 'D1 数据库 (推荐)', value: 'd1' },
				{ name: 'KV 命名空间', value: 'kv' },
				{ name: 'Hybrid (D1 + KV)', value: 'hybrid' },
			],
			default: cached || 'd1',
		},
	]);
	return answers.backend;
}

async function resolveApiKey(options: DeployCommandOptions): Promise<string> {
	const explicit = options.apiKey?.trim() || process.env.API_KEY?.trim();
	if (explicit) {
		if (explicit.length < 16) throw new Error('API Key 至少需要 16 字符');
		return explicit;
	}
	ensureInteractiveAllowed(parseBooleanFlag(options.nonInteractive), '缺少 --api-key/API_KEY，且当前为非交互模式');
	while (true) {
		const inputAnswers = await inquirer.prompt([{ type: 'password', name: 'apiKey', message: '输入 API Key (直接回车可选择自动生成):' }]);
		const inputKey = inputAnswers.apiKey?.trim();
		if (inputKey && inputKey.length >= 16) return inputKey;
		if (!inputKey) {
			const choiceAnswers = await inquirer.prompt([
				{
					type: 'list',
					name: 'choice',
					message: 'API Key 为空，请选择操作:',
					choices: [
						{ name: '生成随机密钥', value: 'generate' },
						{ name: '重新输入', value: 'retry' },
					],
					default: 'generate',
				},
			]);
			if (choiceAnswers.choice === 'generate') {
				const newKey = generateSecureApiKey();
				log.success('已生成 API Key，请妥善保存并按需写入环境变量');
				console.log(newKey);
				return newKey;
			}
		} else {
			log.warning('API Key 至少需要 16 字符');
		}
	}
}

function resolveMissingResourcePolicy(options: DeployCommandOptions): MissingResourcePolicy {
	const policy = normalizeMissingResourcePolicy(options.missingResource || process.env.DEPLOY_MISSING_RESOURCE_POLICY);
	if (policy) return policy;
	if (parseBooleanFlag(options.yes)) return 'auto';
	return 'ask';
}

async function checkPrerequisites(): Promise<boolean> {
	log.info('检查系统环境...');
	const requirements = ['node', 'npm', 'npx'];
	const missing = requirements.filter((cmd) => !checkCommand(cmd));
	if (missing.length > 0) {
		log.error(`缺少工具: ${missing.join(', ')}`);
		return false;
	}
	try {
		getCommandOutput(`${getWranglerCommand()} --version`, 10000);
	} catch {
		log.error('无法执行本地 Wrangler，请先运行 npm install');
		return false;
	}
	log.success('环境检查完成');
	return true;
}

async function checkCloudflareAuth(nonInteractive = false): Promise<boolean> {
	log.info('检查 Cloudflare 认证...');
	const hasApiToken = !!process.env.CLOUDFLARE_API_TOKEN;
	const isLoggedIn = checkWranglerLogin();
	if (hasApiToken || isLoggedIn) {
		log.success('认证已配置');
		return true;
	}
	log.warning('未检测到认证');
	log.info('方式: npx wrangler login 或 CLOUDFLARE_API_TOKEN');
	if (nonInteractive) return false;
	const answer = await inquirer.prompt([{ type: 'confirm', name: 'loginNow', message: '立即登录?', default: true }]);
	if (answer.loginNow) return await executeCommand(`${getWranglerCommand()} login`, '登录');
	return false;
}

function listD1Databases(): Array<{ uuid: string; name: string }> {
	return JSON.parse(getCommandOutput(`${getWranglerCommand()} d1 list --json`, 30000));
}

function listKVNamespaces(): Array<{ id: string; title: string }> {
	return JSON.parse(getCommandOutput(`${getWranglerCommand()} kv namespace list --json`, 30000));
}

function listR2Buckets(): Array<{ name: string }> {
	const output = getCommandOutput(`${getWranglerCommand()} r2 bucket list --json`, 30000);
	return JSON.parse(output);
}

async function selectD1Database(binding: D1Binding, nonInteractive: boolean): Promise<ResourceInfo | null> {
	log.info('获取 D1 数据库列表...');
	try {
		const dbs = listD1Databases();
		if (dbs.length === 0) {
			log.warning('未找到任何 D1 数据库');
			return null;
		}
		ensureInteractiveAllowed(nonInteractive, `D1 ${binding.binding} 缺失，且当前为非交互模式`);
		const answers = await inquirer.prompt([
			{
				type: 'list',
				name: 'databaseId',
				message: `选择要绑定到 ${binding.binding} 的 D1 数据库:`,
				choices: dbs.map((db) => ({ name: `${db.name} (${db.uuid})`, value: db.uuid })),
			},
		]);
		const selected = dbs.find((db) => db.uuid === answers.databaseId);
		return selected ? { type: 'd1', binding: binding.binding, id: selected.uuid, status: 'existing' } : null;
	} catch (error) {
		log.warning(`获取 D1 列表失败: ${error}`);
		return null;
	}
}

async function selectKVNamespace(binding: string, nonInteractive: boolean): Promise<ResourceInfo | null> {
	log.info('获取 KV 命名空间列表...');
	try {
		const namespaces = listKVNamespaces();
		if (namespaces.length === 0) {
			log.warning('未找到任何 KV 命名空间');
			return null;
		}
		ensureInteractiveAllowed(nonInteractive, `KV ${binding} 缺失，且当前为非交互模式`);
		const answers = await inquirer.prompt([
			{
				type: 'list',
				name: 'namespaceId',
				message: `选择要绑定到 ${binding} 的 KV 命名空间:`,
				choices: namespaces.map((ns) => ({ name: `${ns.title} (${ns.id})`, value: ns.id })),
			},
		]);
		const selected = namespaces.find((ns) => ns.id === answers.namespaceId);
		return selected ? { type: 'kv', binding, id: selected.id, status: 'existing' } : null;
	} catch (error) {
		log.warning(`获取 KV 列表失败: ${error}`);
		return null;
	}
}

async function selectR2Bucket(binding: R2Binding, nonInteractive: boolean): Promise<ResourceInfo | null> {
	log.info('获取 R2 存储桶列表...');
	try {
		const buckets = listR2Buckets();
		if (buckets.length === 0) {
			log.warning('未找到任何 R2 存储桶');
			return null;
		}
		ensureInteractiveAllowed(nonInteractive, `R2 ${binding.binding} 缺失，且当前为非交互模式`);
		const answers = await inquirer.prompt([
			{
				type: 'list',
				name: 'bucketName',
				message: `选择要绑定到 ${binding.binding} 的 R2 存储桶:`,
				choices: buckets.map((bucket) => ({ name: bucket.name, value: bucket.name })),
			},
		]);
		return { type: 'r2', binding: binding.binding, id: answers.bucketName, status: 'existing' };
	} catch (error) {
		log.warning(`获取 R2 列表失败: ${error}`);
		return null;
	}
}

async function ensureD1Database(binding: D1Binding, options: ResolvedDeployOptions): Promise<ResourceInfo> {
	log.info(`检查 D1: ${binding.binding} (${binding.database_name})`);
	try {
		const dbs = listD1Databases();
		const existing = dbs.find((db) => db.name === binding.database_name || db.uuid === binding.database_id);
		if (existing) {
			log.success(`D1 ${binding.binding}: 已存在 ✓ (${existing.uuid})`);
			return { type: 'd1', binding: binding.binding, id: existing.uuid, status: 'existing' };
		}
	} catch {
		log.info('未找到现有数据库');
	}
	const policy = resolveEffectiveMissingPolicy(options.missingResourcePolicy, options.yes);
	const action = policy === 'ask' ? await promptMissingResourceAction(`D1 ${binding.binding}`) : policy;
	if (action === 'fail') return { type: 'd1', binding: binding.binding, id: '', status: 'pending' };
	if (action === 'manual')
		return (await selectD1Database(binding, options.nonInteractive)) || { type: 'd1', binding: binding.binding, id: '', status: 'pending' };
	let retries = 3;
	while (retries > 0) {
		try {
			const createOutput = getCommandOutput(`${getWranglerCommand()} d1 create ${escapeShellArg(binding.database_name)}`, 60000);
			const idMatch = createOutput.match(/([a-f0-9-]{36})/i);
			if (idMatch) {
				log.success(`D1 创建成功 ✓ (${idMatch[1]})`);
				return { type: 'd1', binding: binding.binding, id: idMatch[1], status: 'created' };
			}
			log.warning('创建成功但未能解析 D1 ID，尝试重新查询');
			const refreshed = listD1Databases().find((db) => db.name === binding.database_name);
			if (refreshed) return { type: 'd1', binding: binding.binding, id: refreshed.uuid, status: 'created' };
			break;
		} catch (error: any) {
			retries--;
			if (error.message?.includes('already exists')) {
				const refreshed = listD1Databases().find((db) => db.name === binding.database_name);
				if (refreshed) return { type: 'd1', binding: binding.binding, id: refreshed.uuid, status: 'existing' };
			}
			if (retries > 0) {
				log.warning(`创建失败，${retries} 次重试...`);
				await new Promise((resolve) => setTimeout(resolve, 3000));
			} else {
				log.warning(`创建失败: ${error.message || error}`);
			}
		}
	}
	return (await selectD1Database(binding, options.nonInteractive)) || { type: 'd1', binding: binding.binding, id: '', status: 'pending' };
}

async function ensureKVNamespace(binding: KVBinding, options: ResolvedDeployOptions): Promise<ResourceInfo> {
	log.info(`检查 KV: ${binding.binding}`);
	try {
		const namespaces = listKVNamespaces();
		const existing = namespaces.find((ns) => ns.title === binding.binding || ns.id === binding.id);
		if (existing) {
			log.success(`KV ${binding.binding}: ${existing.id}`);
			return { type: 'kv', binding: binding.binding, id: existing.id, status: 'existing' };
		}
	} catch {
		log.info('未找到现有 KV');
	}
	const policy = resolveEffectiveMissingPolicy(options.missingResourcePolicy, options.yes);
	const action = policy === 'ask' ? await promptMissingResourceAction(`KV ${binding.binding}`) : policy;
	if (action === 'fail') return { type: 'kv', binding: binding.binding, id: '', status: 'pending' };
	if (action === 'manual')
		return (
			(await selectKVNamespace(binding.binding, options.nonInteractive)) || {
				type: 'kv',
				binding: binding.binding,
				id: '',
				status: 'pending',
			}
		);
	let retries = 3;
	while (retries > 0) {
		try {
			const createOutput = getCommandOutput(`${getWranglerCommand()} kv namespace create ${escapeShellArg(binding.binding)}`, 60000);
			const idMatch = createOutput.match(/([a-f0-9-]{32,36})/i);
			if (idMatch) {
				log.success(`KV 创建成功 ✓ (${idMatch[1]})`);
				return { type: 'kv', binding: binding.binding, id: idMatch[1], status: 'created' };
			}
			const refreshed = listKVNamespaces().find((ns) => ns.title === binding.binding);
			if (refreshed) return { type: 'kv', binding: binding.binding, id: refreshed.id, status: 'created' };
			break;
		} catch (error: any) {
			retries--;
			if (retries > 0) {
				log.warning(`创建失败，${retries} 次重试...`);
				await new Promise((resolve) => setTimeout(resolve, 3000));
			} else {
				log.warning(`创建失败: ${error.message || error}`);
			}
		}
	}
	return (
		(await selectKVNamespace(binding.binding, options.nonInteractive)) || {
			type: 'kv',
			binding: binding.binding,
			id: '',
			status: 'pending',
		}
	);
}

async function ensureR2Bucket(binding: R2Binding, options: ResolvedDeployOptions): Promise<ResourceInfo> {
	log.info(`检查 R2: ${binding.binding} (${binding.bucket_name})`);
	try {
		const buckets = listR2Buckets();
		const existing = buckets.find((bucket) => bucket.name === binding.bucket_name);
		if (existing) {
			log.success(`R2 ${binding.binding}: 已存在 ✓`);
			return { type: 'r2', binding: binding.binding, id: existing.name, status: 'existing' };
		}
	} catch {
		log.info('未找到现有 R2');
	}
	const policy = resolveEffectiveMissingPolicy(options.missingResourcePolicy, options.yes);
	const action = policy === 'ask' ? await promptMissingResourceAction(`R2 ${binding.binding}`) : policy;
	if (action === 'fail') return { type: 'r2', binding: binding.binding, id: '', status: 'pending' };
	if (action === 'manual')
		return (await selectR2Bucket(binding, options.nonInteractive)) || { type: 'r2', binding: binding.binding, id: '', status: 'pending' };
	try {
		getCommandOutput(`${getWranglerCommand()} r2 bucket create ${escapeShellArg(binding.bucket_name)}`, 60000);
		log.success('R2 创建成功 ✓');
		return { type: 'r2', binding: binding.binding, id: binding.bucket_name, status: 'created' };
	} catch (error: any) {
		log.warning(`创建失败: ${error.message || error}`);
	}
	return (await selectR2Bucket(binding, options.nonInteractive)) || { type: 'r2', binding: binding.binding, id: '', status: 'pending' };
}

async function runMigrations(config: WranglerConfig, environment: string): Promise<void> {
	const schemaPath = path.join(getProjectRoot(), 'src', 'database', 'schema.sql');
	if (!fs.existsSync(schemaPath)) {
		log.warning(`迁移文件不存在: ${schemaPath}`);
		return;
	}
	const database = config.d1_databases[0];
	if (!database) {
		log.warning('当前配置没有 D1 绑定，跳过迁移');
		return;
	}
	log.info(`执行迁移: ${schemaPath}`);
	const envArg = environment ? ` --env ${escapeShellArg(environment)}` : '';
	try {
		getCommandOutput(
			`${getWranglerCommand()} d1 execute ${escapeShellArg(database.database_name)} --remote --file=${escapeShellArg(schemaPath)}${envArg}`,
			120000,
		);
		log.success('迁移完成');
	} catch (error) {
		log.warning(`迁移失败: ${error}`);
		throw error;
	}
}

async function setSecrets(apiKey: string, environment: string): Promise<void> {
	log.info(`配置 Secrets (${environment})`);
	try {
		execSync(`${getWranglerCommand()} secret put API_KEY --env ${escapeShellArg(environment)}`, {
			cwd: getProjectRoot(),
			stdio: 'pipe',
			timeout: 60000,
			input: apiKey,
			encoding: 'utf8',
		});
		log.success('Secrets 配置完成');
	} catch (error) {
		log.error(`Secrets 失败: ${error}`);
		throw error;
	}
}

async function resolveDeployOptions(
	config: WranglerConfig,
	state: DeployState | null,
	options: DeployCommandOptions,
): Promise<ResolvedDeployOptions> {
	const nonInteractive = parseBooleanFlag(options.nonInteractive);
	const yes = parseBooleanFlag(options.yes);
	const environment = await resolveEnvironment(config, state, options);
	const storageBackend = await resolveStorageBackend(options, state, environment);
	const apiKey = await resolveApiKey(options);
	return {
		environment,
		storageBackend,
		apiKey,
		missingResourcePolicy: resolveMissingResourcePolicy(options),
		skipMigrate: parseBooleanFlag(options.skipMigrate),
		skipBuild: parseBooleanFlag(options.skipBuild),
		skipHealthcheck: parseBooleanFlag(options.skipHealthcheck),
		yes,
		nonInteractive,
	};
}

async function deploy(options: DeployCommandOptions = {}) {
	console.log(chalk.blue.bold('🚀 Cloudflare Worker 自动部署'));
	console.log(chalk.gray('='.repeat(50)));

	const config = parseWranglerToml();
	const state = loadState();
	console.log(`项目: ${config.name}`);
	console.log(`资源: D1(${config.d1_databases.length}) KV(${config.kv_namespaces.length}) R2(${config.r2_buckets.length})`);
	console.log(`环境: ${getEnvironmentChoices(config).join(', ')}`);

	if (!(await checkPrerequisites())) process.exit(1);
	if (!(await checkCloudflareAuth(parseBooleanFlag(options.nonInteractive)))) process.exit(1);

	const resolvedOptions = await resolveDeployOptions(config, state, options);
	const { environment, storageBackend, apiKey } = resolvedOptions;
	const workerName = getWorkerName(config, environment);

	console.log(chalk.blue.bold(`\n🚀 部署: ${workerName}`));
	console.log(chalk.gray(`后端: ${storageBackend}`));
	console.log(chalk.gray(`缺失资源策略: ${resolvedOptions.missingResourcePolicy}${resolvedOptions.yes ? ' (yes=auto)' : ''}`));
	console.log(chalk.gray('='.repeat(50)));

	const resources: ResourceInfo[] = [];
	let step = 1;
	const totalSteps = [
		true,
		true,
		config.r2_buckets.length > 0,
		!resolvedOptions.skipMigrate && (storageBackend === 'd1' || storageBackend === 'hybrid'),
		!resolvedOptions.skipBuild,
		true,
		!resolvedOptions.skipHealthcheck,
	].filter(Boolean).length;

	if (storageBackend === 'd1' || storageBackend === 'hybrid') {
		log.info(`[${step++}/${totalSteps}] 准备 D1 数据库...`);
		for (const db of config.d1_databases) {
			resources.push(await ensureD1Database(db, resolvedOptions));
		}
	}

	if (storageBackend === 'kv' || storageBackend === 'hybrid') {
		log.info(`[${step++}/${totalSteps}] 准备 KV 命名空间...`);
		for (const kv of config.kv_namespaces) {
			resources.push(await ensureKVNamespace(kv, resolvedOptions));
		}
	}

	if (config.r2_buckets.length > 0) {
		log.info(`[${step++}/${totalSteps}] 准备 R2 存储桶...`);
		for (const r2 of config.r2_buckets) {
			resources.push(await ensureR2Bucket(r2, resolvedOptions));
		}
	}

	if (!resolvedOptions.skipMigrate && (storageBackend === 'd1' || storageBackend === 'hybrid')) {
		log.info(`[${step++}/${totalSteps}] 执行迁移...`);
		await runMigrations(config, environment);
	}

	if (!resolvedOptions.skipBuild) {
		log.info(`[${step++}/${totalSteps}] 构建项目...`);
		const buildOk = await executeCommand('npm run build', '构建');
		if (!buildOk) process.exit(1);
	}

	log.info(`[${step++}/${totalSteps}] 配置 Secrets...`);
	await setSecrets(apiKey, environment);

	const missingResources = resources.filter((r) => !r.id);
	if (missingResources.length > 0) {
		log.error(`部署失败: 以下资源缺少 ID: ${missingResources.map((r) => r.type + '.' + r.binding).join(', ')}`);
		log.info('请手动创建资源后重试，或检查网络连接');
		process.exit(1);
	}

	log.success('资源配置验证通过');

	log.info(`[${step++}/${totalSteps}] 部署到 Cloudflare...`);
	const deployOutput = getCommandOutput(`${getWranglerCommand()} deploy --env ${escapeShellArg(environment)}`, 180000);
	const urlMatch = deployOutput.match(/https:\/\/[^\s]*\.workers\.dev/);
	const workerUrl = urlMatch?.[0] || `https://${workerName}.workers.dev`;

	const versionMatch = deployOutput.match(/Version ID:\s*([^\s]+)/);
	const versionId = versionMatch?.[1] || 'unknown';

	log.success('部署成功!');

	if (!resolvedOptions.skipHealthcheck) {
		log.info(`[${step++}/${totalSteps}] 健康检查...`);
		try {
			const response = await fetch(`${workerUrl}/._jsondb_/api/health`, { signal: AbortSignal.timeout(15000) });
			if (response.ok) {
				log.info(`健康检查: ${(await response.json()).status}`);
			} else {
				log.warning(`健康检查返回异常状态: ${response.status}`);
			}
		} catch {
			log.warning('健康检查超时');
		}
	}

	const nextState = state || {
		schema_version: '1.0',
		project: config.name,
		last_deployed: '',
		environments: {},
	};

	nextState.environments[environment] = {
		worker_name: workerName,
		version_id: versionId,
		deployed_at: new Date().toISOString(),
		storage_backend: storageBackend,
		resources,
	};
	nextState.last_deployed = new Date().toISOString();
	saveState(nextState);

	console.log(chalk.green.bold('\n🎉 部署成功!'));
	console.log(chalk.gray(`后端: ${storageBackend}`));
	console.log(chalk.gray(`前端: ${workerUrl}/dash/`));
	console.log(chalk.gray(`API: ${workerUrl}/._jsondb_/api/`));
}

async function check() {
	console.log(chalk.blue.bold('🔍 检查部署状态'));
	console.log(chalk.gray('='.repeat(50)));

	const config = parseWranglerToml();
	console.log(`项目: ${config.name}`);
	console.log(`资源: D1(${config.d1_databases.length}) KV(${config.kv_namespaces.length}) R2(${config.r2_buckets.length})`);

	try {
		getCommandOutput(`${getWranglerCommand()} --version`, 10000);
		log.success(checkWranglerLogin() ? '已登录' : '未登录');
	} catch {
		log.error('wrangler 未安装');
	}

	const state = loadState();
	if (state) {
		console.log();
		log.info('已部署环境:');
		for (const [env, s] of Object.entries(state.environments)) {
			console.log(`  - ${env}: ${s.worker_name} (${s.storage_backend}) [${s.resources.length} 资源]`);
		}
	}
}

async function status() {
	console.log(chalk.blue.bold('📊 详细状态'));
	console.log(chalk.gray('='.repeat(50)));

	const state = loadState();
	if (!state) {
		log.warning('无状态');
		return;
	}

	console.log(`项目: ${state.project}`);
	console.log(`最后部署: ${state.last_deployed}`);

	for (const [env, s] of Object.entries(state.environments)) {
		console.log(chalk.cyan(`\n${env}:`));
		console.log(`  Worker: ${s.worker_name}`);
		console.log(`  版本: ${s.version_id}`);
		console.log(`  存储: ${s.storage_backend}`);
		console.log(`  时间: ${s.deployed_at}`);
		console.log('  资源:');
		for (const r of s.resources) {
			const icon = r.status === 'existing' ? '✓' : r.status === 'created' ? '🆕' : '⏳';
			console.log(`    ${icon} ${r.type}.${r.binding}: ${r.id || 'pending'}`);
		}
	}
}

async function resources() {
	console.log(chalk.blue.bold('☁️ 云资源'));
	console.log(chalk.gray('='.repeat(50)));

	console.log('\nD1 数据库:');
	try {
		const result = getCommandOutput(`${getWranglerCommand()} d1 list`, 30000);
		console.log(result);
	} catch {
		console.log('  无 D1 资源');
	}

	console.log('\nR2 存储桶:');
	try {
		const result = getCommandOutput(`${getWranglerCommand()} r2 bucket list`, 30000);
		console.log(result);
	} catch {
		console.log('  无 R2 资源 (请在 Dashboard 启用 R2)');
	}

	console.log('\n其他资源请在 Dashboard 查看:');
	console.log('  - KV 命名空间');
	console.log('  - Queues');
	console.log('  - Durable Objects');
	console.log('  https://dash.cloudflare.com');
}

async function migrate() {
	console.log(chalk.blue.bold('🗄️ 数据库迁移'));
	const config = parseWranglerToml();
	const environments = getEnvironmentChoices(config);
	const envAnswers = await inquirer.prompt([
		{
			type: 'list',
			name: 'env',
			message: '选择环境:',
			choices: environments,
			default: environments.includes('development') ? 'development' : environments[0],
		},
	]);
	log.info(`执行 ${envAnswers.env} 迁移...`);
	await runMigrations(config, envAnswers.env);
	log.success('迁移完成');
}

async function config() {
	console.log(chalk.blue.bold('📋 当前配置'));
	console.log(chalk.gray('='.repeat(50)));
	const config = parseWranglerToml();
	console.log(JSON.stringify(config, null, 2));
}

program.name('deploy-cli').description('Cloudflare Worker 智能部署工具 (可扩展架构)').version('4.0.0');

program
	.command('deploy')
	.description('部署')
	.option('--env <environment>', '指定部署环境')
	.option('--storage <backend>', '指定存储后端: d1|kv|hybrid')
	.option('--api-key <key>', '指定 API_KEY，跳过交互输入')
	.option('--missing-resource <policy>', '缺失资源策略: ask|auto|manual|fail')
	.option('--skip-migrate', '跳过数据库迁移')
	.option('--skip-build', '跳过构建')
	.option('--skip-healthcheck', '跳过健康检查')
	.option('--yes', '对默认交互使用推荐值')
	.option('--non-interactive', '禁用交互，缺少参数时直接失败')
	.action(deploy);
program.command('check').description('检查状态').action(check);
program.command('status').description('详细状态').action(status);
program.command('resources').description('云资源').action(resources);
program.command('migrate').description('迁移').action(migrate);
program.command('config').description('查看配置').action(config);

program.parse();
