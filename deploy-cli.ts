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

function getDistFolder(): string {
	return path.join(getProjectRoot(), 'dist');
}

function getStatePath(): string {
	return path.join(getProjectRoot(), '.wrangler', 'deploy', 'state.json');
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
		const result = execSync('wrangler whoami', { encoding: 'utf8', timeout: 10000 });
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
		const child = spawn(command, { shell: true, stdio: 'inherit' });
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

async function ensureD1Database(binding: D1Binding, env: string): Promise<ResourceInfo> {
	async function selectD1Database(): Promise<ResourceInfo | null> {
		log.info('获取 D1 数据库列表...');
		try {
			const result = execSync('wrangler d1 list --json', { encoding: 'utf8', timeout: 30000 });
			const dbs: Array<{ uuid: string; name: string }> = JSON.parse(result);

			if (dbs.length === 0) {
				log.warning('未找到任何 D1 数据库');
				return null;
			}

			const choices = dbs.map((db) => ({
				name: `${db.name} (${db.uuid})`,
				value: db.uuid,
			}));

			const answers = await inquirer.prompt([
				{
					type: 'list',
					name: 'databaseId',
					message: '选择要绑定的 D1 数据库:',
					choices,
				},
			]);

			const selected = dbs.find((db) => db.uuid === answers.databaseId);
			if (selected) {
				return { type: 'd1', binding: binding.binding, id: selected.uuid, status: 'existing' };
			}
		} catch (error) {
			log.warning(`获取 D1 列表失败: ${error}`);
		}
		return null;
	}

	log.info(`检查 D1: ${binding.binding} (${binding.database_name})`);

	try {
		const result = execSync('wrangler d1 list --json', { encoding: 'utf8', timeout: 30000 });
		const dbs: Array<{ uuid: string; name: string }> = JSON.parse(result);
		const db = dbs.find((d) => d.name === binding.database_name);
		if (db) {
			log.success(`D1 ${binding.binding}: 已存在 ✓ (${db.uuid})`);
			return { type: 'd1', binding: binding.binding, id: db.uuid, status: 'existing' };
		}
	} catch {
		log.info('未找到现有数据库');
	}

	log.info(`创建 D1: ${binding.database_name}`);

	let retries = 3;
	while (retries > 0) {
		try {
			const createOutput = execSync(`npx wrangler d1 create ${binding.database_name}`, { encoding: 'utf8', timeout: 60000 });
			log.success('D1 创建成功 ✓');

			const idMatch = createOutput.match(/([a-f0-9-]{36})/);
			if (idMatch) {
				log.success(`获取 D1 ID: ${idMatch[1]}`);
				return { type: 'd1', binding: binding.binding, id: idMatch[1], status: 'created' };
			}

			log.warning('无法从创建输出中提取 ID');
			break;
		} catch (error: any) {
			if (error.message.includes('already exists')) {
				log.info(`D1 ${binding.database_name} 已存在`);
				break;
			}
			retries--;
			if (retries > 0) {
				log.warning(`创建失败，${retries} 次重试...`);
				await new Promise((resolve) => setTimeout(resolve, 3000));
			} else {
				log.warning(`创建失败: ${error.message}`);
			}
		}
	}

	log.info('尝试从现有数据库中选择...');
	const selected = await selectD1Database();
	if (selected) {
		return selected;
	}

	return { type: 'd1', binding: binding.binding, id: '', status: 'pending' };
}

async function selectKVNamespace(binding: string): Promise<ResourceInfo | null> {
	log.info('获取 KV 命名空间列表...');
	try {
		const result = execSync('wrangler kv:namespace list --json', { encoding: 'utf8', timeout: 30000 });
		const namespaces: Array<{ id: string; title: string }> = JSON.parse(result);

		if (namespaces.length === 0) {
			log.warning('未找到任何 KV 命名空间');
			return null;
		}

		const choices = namespaces.map((ns) => ({
			name: `${ns.title} (${ns.id})`,
			value: ns.id,
		}));

		const answers = await inquirer.prompt([
			{
				type: 'list',
				name: 'namespaceId',
				message: '选择要绑定的 KV 命名空间:',
				choices,
			},
		]);

		const selected = namespaces.find((ns) => ns.id === answers.namespaceId);
		if (selected) {
			return { type: 'kv', binding: binding, id: selected.id, status: 'existing' };
		}
	} catch (error) {
		log.warning(`获取 KV 列表失败: ${error}`);
	}
	return null;
}

async function ensureKVNamespace(binding: KVBinding, env: string): Promise<ResourceInfo> {
	log.info(`检查 KV: ${binding.binding}`);
	try {
		const result = execSync('wrangler kv:namespace list --json', { encoding: 'utf8', timeout: 30000 });
		const namespaces: Array<{ id: string; title: string }> = JSON.parse(result);
		const ns = namespaces.find((n) => n.title === binding.binding);
		if (ns) {
			log.success(`KV ${binding.binding}: ${ns.id}`);
			return { type: 'kv', binding: binding.binding, id: ns.id, status: 'existing' };
		}
	} catch {
		log.info('未找到现有 KV');
	}
	log.info(`创建 KV: ${binding.binding}`);

	let retries = 3;
	while (retries > 0) {
		try {
			const createOutput = execSync(`npx wrangler kv:namespace create "${binding.binding}"`, { encoding: 'utf8', timeout: 60000 });
			log.success('KV 创建成功');

			const idMatch = createOutput.match(/([a-f0-9-]{36})/);
			if (idMatch) {
				return { type: 'kv', binding: binding.binding, id: idMatch[1], status: 'created' };
			}
			log.warning('无法从创建输出中提取 ID');
			break;
		} catch (error) {
			retries--;
			if (retries > 0) {
				log.warning(`创建失败，${retries} 次重试...`);
				await new Promise((resolve) => setTimeout(resolve, 3000));
			} else {
				log.warning(`创建失败: ${error}`);
			}
		}
	}

	log.info('尝试从现有命名空间中选择...');
	const selected = await selectKVNamespace(binding.binding);
	if (selected) {
		return selected;
	}

	return { type: 'kv', binding: binding.binding, id: '', status: 'pending' };
}

async function ensureR2Bucket(binding: R2Binding, env: string): Promise<ResourceInfo> {
	log.info(`检查 R2: ${binding.binding} (${binding.bucket_name})`);

	try {
		const result = execSync('wrangler r2 bucket list', { encoding: 'utf8', timeout: 30000 });
		if (result.includes(binding.bucket_name)) {
			log.success(`R2 ${binding.binding}: 已存在 ✓`);
			return { type: 'r2', binding: binding.binding, id: binding.bucket_name, status: 'existing' };
		}
	} catch {
		log.info('未找到现有 R2');
	}

	log.info(`创建 R2: ${binding.bucket_name}`);
	try {
		execSync(`npx wrangler r2 bucket create ${binding.bucket_name}`, { stdio: 'inherit', timeout: 60000 });
		log.success('R2 创建成功 ✓');
		return { type: 'r2', binding: binding.binding, id: binding.bucket_name, status: 'created' };
	} catch (error: any) {
		if (error.message.includes('already exists') || error.message.includes('Bucket already exists')) {
			log.warning(`R2 ${binding.bucket_name} 已存在，使用现有存储桶`);
			return { type: 'r2', binding: binding.binding, id: binding.bucket_name, status: 'existing' };
		}
		log.warning(`创建失败: ${error.message}`);
	}

	return { type: 'r2', binding: binding.binding, id: '', status: 'pending' };
}

async function runMigrations(migrationsDir: string): Promise<void> {
	const schemaPath = path.join(getProjectRoot(), 'src', 'database', 'schema.sql');
	if (!fs.existsSync(schemaPath)) {
		log.warning(`迁移文件不存在: ${schemaPath}`);
		return;
	}
	log.info(`执行迁移: ${schemaPath}`);
	try {
		execSync(`npx wrangler d1 execute jsonbase --remote --file=${schemaPath}`, {
			stdio: 'inherit',
			timeout: 120000,
		});
		log.success('迁移完成');
	} catch (error) {
		log.warning(`迁移失败: ${error}`);
	}
}

async function setSecrets(apiKey: string, environment: string): Promise<void> {
	log.info(`配置 Secrets (${environment})`);
	try {
		execSync(`echo "${apiKey}" | wrangler secret put API_KEY --env ${environment}`, {
			stdio: 'inherit',
			timeout: 60000,
		});
		log.success('Secrets 配置完成');
	} catch (error) {
		log.error(`Secrets 失败: ${error}`);
		throw error;
	}
}

function generateWranglerJsonc(
	config: WranglerConfig,
	environment: string,
	storageBackend: StorageBackend,
	resources: ResourceInfo[],
): string {
	const envConfig = config.environments[environment];
	const workerName = envConfig?.name || `${config.name}-${environment}`;

	const wranglerConfig: any = {
		$schema: '../node_modules/wrangler/config-schema.json',
		name: workerName,
		main: 'index.js',
		compatibility_date: config.compatibility_date,
		compatibility_flags: config.compatibility_flags,
		build: config.build,
		vars: {
			...config.vars,
			ENVIRONMENT: environment,
			STORAGE_BACKEND: storageBackend,
		},
	};

	wranglerConfig.env = {};
	wranglerConfig.env[environment] = {
		name: workerName,
		vars: {
			...config.vars,
			ENVIRONMENT: environment,
			STORAGE_BACKEND: storageBackend,
		},
	};

	if (storageBackend === 'd1' || storageBackend === 'hybrid') {
		wranglerConfig.env[environment].d1_databases = config.d1_databases.map((db) => {
			const resource = resources.find((r) => r.type === 'd1' && r.binding === db.binding);
			return {
				binding: db.binding,
				database_name: db.database_name,
				database_id: resource?.id || '',
			};
		});
	}

	if (storageBackend === 'kv' || storageBackend === 'hybrid') {
		wranglerConfig.env[environment].kv_namespaces = config.kv_namespaces.map((kv) => {
			const resource = resources.find((r) => r.type === 'kv' && r.binding === kv.binding);
			return {
				binding: kv.binding,
				id: resource?.id || '',
			};
		});
	}

	if (envConfig?.assets) {
		wranglerConfig.env[environment].assets = {
			directory: '../' + envConfig.assets.directory,
			binding: envConfig.assets.binding,
			run_worker_first: envConfig.assets.run_worker_first,
		};
	}

	return JSON.stringify(wranglerConfig, null, 2);
}

async function checkPrerequisites(): Promise<boolean> {
	log.info('检查系统环境...');
	const requirements = ['node', 'npm', 'npx'];
	const missing = requirements.filter((cmd) => !checkCommand(cmd));
	if (missing.length > 0) {
		log.error(`缺少工具: ${missing.join(', ')}`);
		return false;
	}
	if (!checkCommand('wrangler')) {
		log.info('安装 wrangler...');
		const success = await executeCommand('npm install -g wrangler', '安装 wrangler');
		if (!success) return false;
	}
	log.success('环境检查完成');
	return true;
}

async function getApiKey(): Promise<string> {
	const envApiKey = process.env.API_KEY?.trim();
	if (envApiKey && envApiKey.length >= 16) {
		log.info('使用环境变量中的 API_KEY');
		return envApiKey;
	}

	while (true) {
		const inputAnswers = await inquirer.prompt([
			{
				type: 'password',
				name: 'apiKey',
				message: '输入 API Key (直接回车选择生成方式):',
			},
		]);

		const inputKey = inputAnswers.apiKey?.trim();
		if (inputKey && inputKey.length >= 16) {
			return inputKey;
		}

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
				},
			]);

			if (choiceAnswers.choice === 'generate') {
				const newKey = generateSecureApiKey();
				log.info(`密钥: ${newKey}`);
				log.warning('设置环境变量: export API_KEY=' + newKey);
				return newKey;
			}
		} else {
			log.warning('API Key 至少需要 16 字符');
		}
	}
}

async function checkCloudflareAuth(): Promise<boolean> {
	log.info('检查 Cloudflare 认证...');
	const hasApiToken = !!process.env.CLOUDFLARE_API_TOKEN;
	const isLoggedIn = checkWranglerLogin();
	if (hasApiToken || isLoggedIn) {
		log.success('认证已配置');
		return true;
	}
	log.warning('未检测到认证');
	log.info('方式: wrangler login 或 CLOUDFLARE_API_TOKEN');
	const answer = await inquirer.prompt([{ type: 'confirm', name: 'loginNow', message: '立即登录?', default: true }]);
	if (answer.loginNow) return await executeCommand('wrangler login', '登录');
	return false;
}

async function selectStorageBackend(): Promise<StorageBackend> {
	const envBackend = process.env.STORAGE_BACKEND as StorageBackend;
	if (envBackend && ['d1', 'kv', 'hybrid'].includes(envBackend)) {
		log.info(`使用 STORAGE_BACKEND=${envBackend}`);
		return envBackend;
	}
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
			default: 'd1',
		},
	]);
	return answers.backend;
}

async function deploy() {
	console.log(chalk.blue.bold('🚀 Cloudflare Worker 自动部署'));
	console.log(chalk.gray('='.repeat(50)));

	const config = parseWranglerToml();
	console.log(`项目: ${config.name}`);
	console.log(`资源: D1(${config.d1_databases.length}) KV(${config.kv_namespaces.length}) R2(${config.r2_buckets.length})`);
	console.log(`环境: ${Object.keys(config.environments).join(', ')}`);

	if (!(await checkPrerequisites())) process.exit(1);
	if (!(await checkCloudflareAuth())) process.exit(1);

	const storageBackend = await selectStorageBackend();
	const apiKey = await getApiKey();

	const envAnswers = await inquirer.prompt([
		{ type: 'list', name: 'env', message: '选择环境:', choices: Object.keys(config.environments), default: 'development' },
	]);
	const environment = envAnswers.env;
	const envConfig = config.environments[environment];
	const workerName = envConfig?.name || `${config.name}-${environment}`;

	console.log(chalk.blue.bold(`\n🚀 部署: ${workerName}`));
	console.log(chalk.gray(`后端: ${storageBackend}`));
	console.log(chalk.gray('='.repeat(50)));

	const resources: ResourceInfo[] = [];
	let step = 1;
	const totalSteps = 7;

	if (storageBackend === 'd1' || storageBackend === 'hybrid') {
		log.info(`[${step++}/${totalSteps}] 准备 D1 数据库...`);
		for (const db of config.d1_databases) {
			resources.push(await ensureD1Database(db, environment));
		}
	}

	if (storageBackend === 'kv' || storageBackend === 'hybrid') {
		log.info(`[${step++}/${totalSteps}] 准备 KV 命名空间...`);
		for (const kv of config.kv_namespaces) {
			resources.push(await ensureKVNamespace(kv, environment));
		}
	}

	if (config.r2_buckets.length > 0) {
		log.info(`[${step++}/${totalSteps}] 准备 R2 存储桶...`);
		for (const r2 of config.r2_buckets) {
			resources.push(await ensureR2Bucket(r2, environment));
		}
	}

	if (storageBackend === 'd1' || storageBackend === 'hybrid') {
		log.info(`[${step++}/${totalSteps}] 执行迁移...`);
		await runMigrations(config.deploy_options.migrations_dir);
	}

	log.info(`[${step++}/${totalSteps}] 配置 Secrets...`);
	await setSecrets(apiKey, environment);

	log.info(`[${step++}/${totalSteps}] 构建项目...`);
	await executeCommand('npm run build:all', '构建');

	const distFolder = getDistFolder();
	if (!fs.existsSync(distFolder)) fs.mkdirSync(distFolder, { recursive: true });

	log.info(`[${step++}/${totalSteps}] 生成配置...`);
	const wranglerJsonc = generateWranglerJsonc(config, environment, storageBackend, resources);
	fs.writeFileSync(path.join(distFolder, 'wrangler.jsonc'), wranglerJsonc);

	const missingResources = resources.filter((r) => !r.id && (r.type === 'd1' || r.type === 'kv'));
	if (missingResources.length > 0) {
		log.error(`部署失败: 以下资源缺少 ID: ${missingResources.map((r) => r.type + '.' + r.binding).join(', ')}`);
		log.info('请手动创建资源后重试，或检查网络连接');
		process.exit(1);
	}

	log.success('资源配置验证通过');

	log.info(`[${step++}/${totalSteps}] 部署到 Cloudflare...`);
	const deployOutput = execSync(`wrangler deploy --config dist/wrangler.jsonc --env ${environment}`, { encoding: 'utf8', timeout: 180000 });
	const urlMatch = deployOutput.match(/https:\/\/[^\s]*\.workers\.dev/);
	const workerUrl = urlMatch?.[0] || `https://${workerName}.workers.dev`;

	const versionMatch = deployOutput.match(/Version ID:\s*([^\s]+)/);
	const versionId = versionMatch?.[1] || 'unknown';

	log.success('部署成功!');

	try {
		const response = await fetch(`${workerUrl}/._jsondb_/api/health`, { signal: AbortSignal.timeout(15000) });
		if (response.ok) log.info(`健康检查: ${(await response.json()).status}`);
	} catch {
		log.warning('健康检查超时');
	}

	const state = loadState() || {
		schema_version: '1.0',
		project: config.name,
		last_deployed: '',
		environments: {},
	};

	state.environments[environment] = {
		worker_name: workerName,
		version_id: versionId,
		deployed_at: new Date().toISOString(),
		storage_backend: storageBackend,
		resources,
	};
	state.last_deployed = new Date().toISOString();
	saveState(state);

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

	if (checkCommand('wrangler')) {
		log.success(checkWranglerLogin() ? '已登录' : '未登录');
	} else {
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
		const result = execSync('npx wrangler d1 list', { encoding: 'utf8', timeout: 30000 });
		console.log(result);
	} catch {
		console.log('  无 D1 资源');
	}

	console.log('\nR2 存储桶:');
	try {
		const result = execSync('npx wrangler r2 bucket list', { encoding: 'utf8', timeout: 30000 });
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
	const envAnswers = await inquirer.prompt([
		{ type: 'list', name: 'env', message: '选择环境:', choices: Object.keys(config.environments), default: 'development' },
	]);
	log.info(`执行 ${envAnswers.env} 迁移...`);
	await runMigrations(config.deploy_options.migrations_dir);
	log.success('迁移完成');
}

async function config() {
	console.log(chalk.blue.bold('📋 当前配置'));
	console.log(chalk.gray('='.repeat(50)));
	const config = parseWranglerToml();
	console.log(JSON.stringify(config, null, 2));
}

program.name('deploy-cli').description('Cloudflare Worker 智能部署工具 (可扩展架构)').version('4.0.0');

program.command('deploy').description('部署').action(deploy);
program.command('check').description('检查状态').action(check);
program.command('status').description('详细状态').action(status);
program.command('resources').description('云资源').action(resources);
program.command('migrate').description('迁移').action(migrate);
program.command('config').description('查看配置').action(config);

program.parse();
