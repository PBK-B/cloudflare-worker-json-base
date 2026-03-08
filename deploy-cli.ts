import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonArray = JsonValue[];
type JsonObject = { [key: string]: JsonValue };
type StorageBackend = 'd1' | 'kv';
type MissingResourcePolicy = 'ask' | 'auto' | 'manual' | 'fail';

interface DeployOptions {
	env?: string;
	storage?: string;
	missingResource?: string;
	plan?: boolean;
	dryRun?: boolean;
	confFile?: string;
	var?: string[];
	envFile?: string[];
	keepVars?: boolean;
	nonInteractive?: boolean;
	yes?: boolean;
	skipMigrate?: boolean;
	skipHealthcheck?: boolean;
	skipBuild?: boolean;
	apiKey?: string;
}

interface ResourceInfo {
	type: 'd1' | 'kv' | 'r2';
	binding: string;
	id: string;
	status: 'existing' | 'created' | 'pending';
	name?: string;
}

interface D1BindingConfig {
	binding: string;
	database_name: string;
	database_id?: string;
	preview_id?: string;
	migrations_dir?: string;
}

interface KVBindingConfig {
	binding: string;
	id?: string;
	preview_id?: string;
}

interface R2BindingConfig {
	binding: string;
	bucket_name: string;
	jurisdiction?: string;
}

const WORKDIR = process.cwd();
const WRANGLER_TOML_PATH = path.join(WORKDIR, 'wrangler.toml');
const WRANGLER_SCHEMA_PATH = path.join(WORKDIR, 'node_modules', 'wrangler', 'config-schema.json');
const DEPLOY_DIR = path.join(WORKDIR, '.wrangler', 'deploy');
const SENSITIVE_VAR_KEYS = new Set(['API_KEY']);
const NON_INHERITABLE_ENV_KEYS = new Set([
	'define',
	'secrets',
	'durable_objects',
	'kv_namespaces',
	'r2_buckets',
	'vectorize',
	'services',
	'queues',
	'workflows',
	'tail_consumers',
	'unsafe',
	'mtls_certificates',
	'dispatch_namespaces',
	'analytics_engine_datasets',
	'hyperdrive',
	'browser',
	'ai',
	'images',
	'vectors',
]);

function logInfo(message: string): void {
	console.log(chalk.blue('[INFO]'), message);
}

function logSuccess(message: string): void {
	console.log(chalk.green('[SUCCESS]'), message);
}

function logWarn(message: string): void {
	console.log(chalk.yellow('[WARNING]'), message);
}

function logError(message: string): void {
	console.log(chalk.red('[ERROR]'), message);
}

function logStep(label: string, detail?: string): void {
	logInfo(detail ? `${label}: ${detail}` : label);
}

function logDone(label: string, detail?: string): void {
	logSuccess(detail ? `${label}: ${detail}` : label);
}

function logSkip(label: string, detail?: string): void {
	logWarn(detail ? `${label}: ${detail}` : label);
}

function fail(message: string): never {
	logError(message);
	process.exit(1);
}

function run(command: string, args: string[], options: { input?: string; timeout?: number } = {}): { ok: boolean; stdout: string; stderr: string; status: number | null } {
	const result = spawnSync(command, args, {
		cwd: WORKDIR,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
		input: options.input,
		timeout: options.timeout ?? 120000,
	});

	return {
		ok: result.status === 0,
		stdout: result.stdout || '',
		stderr: result.stderr || '',
		status: result.status,
	};
}

function readText(filePath: string): string {
	return fs.readFileSync(filePath, 'utf8');
}

function parseScalar(raw: string): JsonValue {
	const value = raw.trim();
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
		return value.slice(1, -1);
	}
	if (value === 'true') return true;
	if (value === 'false') return false;
	if (value === 'null') return null;
	if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
	if (value.startsWith('[') && value.endsWith(']')) {
		const body = value.slice(1, -1).trim();
		if (!body) return [];
		const parts: string[] = [];
		let current = '';
		let quote: '"' | "'" | null = null;
		let depth = 0;
		for (const ch of body) {
			if ((ch === '"' || ch === "'") && (!quote || quote === ch)) {
				quote = quote ? null : (ch as '"' | "'");
				current += ch;
				continue;
			}
			if (!quote) {
				if (ch === '[' || ch === '{') depth += 1;
				if (ch === ']' || ch === '}') depth -= 1;
				if (ch === ',' && depth === 0) {
					parts.push(current.trim());
					current = '';
					continue;
				}
			}
			current += ch;
		}
		if (current.trim()) parts.push(current.trim());
		return parts.map((part) => parseScalar(part));
	}
	if (value.startsWith('{') && value.endsWith('}')) {
		return {};
	}
	return value;
}

function stripTomlComment(line: string): string {
	let result = '';
	let quote: '"' | "'" | null = null;
	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		if ((ch === '"' || ch === "'") && (!quote || quote === ch)) {
			quote = quote ? null : (ch as '"' | "'");
			result += ch;
			continue;
		}
		if (!quote && ch === '#') {
			break;
		}
		result += ch;
	}
	return result.trim();
}

function ensurePathObject(target: JsonObject, keyPath: string[]): JsonObject {
	let current = target;
	for (const key of keyPath) {
		if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
			current[key] = {};
		}
		current = current[key] as JsonObject;
	}
	return current;
}

function parseTomlLite(content: string): JsonObject {
	const root: JsonObject = {};
	let current: JsonObject = root;

	for (const rawLine of content.split(/\r?\n/)) {
		const line = stripTomlComment(rawLine);
		if (!line) continue;

		const arrayTableMatch = line.match(/^\[\[\s*([^\]]+)\s*\]\]$/);
		if (arrayTableMatch) {
			const keyPath = arrayTableMatch[1].split('.').map((part) => part.trim());
			const parent = ensurePathObject(root, keyPath.slice(0, -1));
			const listKey = keyPath[keyPath.length - 1];
			if (!Array.isArray(parent[listKey])) {
				parent[listKey] = [];
			}
			const item: JsonObject = {};
			(parent[listKey] as JsonArray).push(item);
			current = item;
			continue;
		}

		const tableMatch = line.match(/^\[\s*([^\]]+)\s*\]$/);
		if (tableMatch) {
			const keyPath = tableMatch[1].split('.').map((part) => part.trim());
			current = ensurePathObject(root, keyPath);
			continue;
		}

		const pair = line.match(/^([A-Za-z0-9_\-\.]+)\s*=\s*(.+)$/);
		if (!pair) continue;
		const key = pair[1].trim();
		current[key] = parseScalar(pair[2]);
	}

	return root;
}

function stripJsonComments(input: string): string {
	return input.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s+)\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1');
}

function parseConfigFile(filePath: string): JsonObject {
	const absPath = path.isAbsolute(filePath) ? filePath : path.join(WORKDIR, filePath);
	if (!fs.existsSync(absPath)) {
		fail(`--conf-file 不存在: ${filePath}`);
	}
	const ext = path.extname(absPath).toLowerCase();
	const content = readText(absPath);
	if (ext === '.toml') {
		return parseTomlLite(content);
	}
	if (ext === '.json' || ext === '.jsonc') {
		return JSON.parse(stripJsonComments(content)) as JsonObject;
	}
	fail(`--conf-file 格式不支持: ${filePath}`);
}

function deepClone<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj)) as T;
}

function deepMerge(target: JsonObject, source: JsonObject): JsonObject {
	const out = deepClone(target);
	for (const [key, sourceValue] of Object.entries(source)) {
		if (Array.isArray(sourceValue)) {
			out[key] = deepClone(sourceValue);
			continue;
		}
		if (sourceValue && typeof sourceValue === 'object') {
			const targetValue = out[key];
			if (targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
				out[key] = deepMerge(targetValue as JsonObject, sourceValue as JsonObject);
			} else {
				out[key] = deepClone(sourceValue as JsonObject);
			}
			continue;
		}
		out[key] = sourceValue;
	}
	return out;
}

function getSchemaAllowList(schemaPath: string): Set<string> {
	if (!fs.existsSync(schemaPath)) {
		fail(`未找到 Wrangler schema: ${schemaPath}`);
	}
	const schema = JSON.parse(readText(schemaPath)) as JsonObject;
	const defs = schema.definitions as JsonObject;
	const rawConfig = defs?.RawConfig as JsonObject;
	const props = rawConfig?.properties as JsonObject;
	if (!props || typeof props !== 'object') {
		fail('Wrangler schema 结构异常，无法读取 RawConfig.properties');
	}
	return new Set(Object.keys(props));
}

function sanitizeConfigBySchema(config: JsonObject, allowList: Set<string>): JsonObject {
	const out: JsonObject = {};
	for (const [key, value] of Object.entries(config)) {
		if (allowList.has(key)) {
			out[key] = value;
		}
	}
	return out;
}

function parseVarPair(raw: string): [string, string] {
	const idx = raw.indexOf(':');
	if (idx <= 0 || idx === raw.length - 1) {
		fail(`--var 格式错误: ${raw}，应为 KEY:VALUE`);
	}
	return [raw.slice(0, idx), raw.slice(idx + 1)];
}

function parseEnvFile(filePath: string): Record<string, string> {
	const absPath = path.isAbsolute(filePath) ? filePath : path.join(WORKDIR, filePath);
	if (!fs.existsSync(absPath)) {
		fail(`--env-file 不存在: ${filePath}`);
	}
	const vars: Record<string, string> = {};
	for (const line of readText(absPath).split(/\r?\n/)) {
		const text = line.trim();
		if (!text || text.startsWith('#')) continue;
		const idx = text.indexOf('=');
		if (idx <= 0) continue;
		vars[text.slice(0, idx).trim()] = text.slice(idx + 1).trim();
	}
	return vars;
}

function checkSensitiveVars(config: JsonObject): void {
	const vars = config.vars;
	if (!vars || typeof vars !== 'object' || Array.isArray(vars)) return;
	for (const key of Object.keys(vars as JsonObject)) {
		if (SENSITIVE_VAR_KEYS.has(key)) {
			fail(`检测到敏感变量 ${key} 出现在 vars 中。请改为使用 wrangler secret put ${key}`);
		}
	}
}

function generateSecureApiKey(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
	let key = '';
	const randomValues = new Uint32Array(32);
	crypto.getRandomValues(randomValues);
	for (let i = 0; i < 32; i += 1) {
		key += chars[randomValues[i] % chars.length];
	}
	return key;
}

function getDefaultEnvironment(baseConfig: JsonObject): string {
	const envs = Object.keys((baseConfig.env as JsonObject) || {});
	if (envs.includes('development')) {
		return 'development';
	}
	return envs[0] || 'development';
}

function normalizeStorageBackend(value?: string): StorageBackend | undefined {
	if (!value) return undefined;
	if (value === 'd1' || value === 'kv') return value;
	return undefined;
}

function normalizeMissingResourcePolicy(value?: string): MissingResourcePolicy | undefined {
	if (!value) return undefined;
	if (value === 'ask' || value === 'auto' || value === 'manual' || value === 'fail') return value;
	return undefined;
}

function hasD1Binding(config: JsonObject): boolean {
	return Array.isArray(config.d1_databases) && config.d1_databases.length > 0;
}

function getWorkerName(config: JsonObject): string {
	if (typeof config.name === 'string' && config.name.trim()) {
		return config.name;
	}
	return 'worker';
}

function parseBooleanFlag(value: unknown): boolean {
	return value === true;
}

function isCiEnvironment(): boolean {
	return process.env.CI === 'true' || process.env.CI === '1';
}

function isNonInteractiveMode(options: DeployOptions): boolean {
	return parseBooleanFlag(options.nonInteractive) || isCiEnvironment();
}

async function resolveEnvironment(baseConfig: JsonObject, options: DeployOptions): Promise<string> {
	if (options.env) return options.env;
	const envs = Object.keys((baseConfig.env as JsonObject) || {});
	if (isNonInteractiveMode(options)) {
		return getDefaultEnvironment(baseConfig);
	}
	const answer = await inquirer.prompt([
		{
			type: 'list',
			name: 'env',
			message: '选择部署环境',
			choices: envs.length > 0 ? envs : ['development', 'production'],
			default: envs.includes('development') ? 'development' : envs[0],
		},
	]);
	return answer.env as string;
}

async function resolveApiKey(options: DeployOptions): Promise<string | undefined> {
	const explicit = options.apiKey?.trim() || process.env.API_KEY?.trim();
	if (explicit) {
		if (explicit.length < 16) {
			fail('API Key 至少需要 16 字符');
		}
		return explicit;
	}
	if (isNonInteractiveMode(options)) {
		return undefined;
	}
	while (true) {
		const inputAnswers = await inquirer.prompt([
			{ type: 'password', name: 'apiKey', message: '输入 API Key (直接回车可选择自动生成):' },
		]);
		const inputKey = (inputAnswers.apiKey as string | undefined)?.trim();
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
					default: 'generate',
				},
			]);
			if (choiceAnswers.choice === 'generate') {
				const newKey = generateSecureApiKey();
				logSuccess('已生成 API Key，请妥善保存并按需写入环境变量');
				console.log(newKey);
				return newKey;
			}
		} else {
			logWarn('API Key 至少需要 16 字符');
		}
	}
}

async function resolveStorageBackend(baseConfig: JsonObject, options: DeployOptions): Promise<StorageBackend> {
	const explicit = normalizeStorageBackend(options.storage || process.env.STORAGE_BACKEND);
	if (explicit) {
		return explicit;
	}

	const vars = baseConfig.vars;
	const configured = vars && typeof vars === 'object' && !Array.isArray(vars) ? normalizeStorageBackend(String((vars as JsonObject).STORAGE_BACKEND || '')) : undefined;
	const defaultBackend = configured || 'd1';

	if (isNonInteractiveMode(options) || options.yes) {
		return defaultBackend;
	}

	const answer = await inquirer.prompt([
		{
			type: 'list',
			name: 'storage',
			message: '选择存储后端',
			choices: [
				{ name: 'D1 数据库 (推荐)', value: 'd1' },
				{ name: 'KV 命名空间', value: 'kv' },
			],
			default: defaultBackend,
		},
	]);

	return answer.storage as StorageBackend;
}

async function resolveMissingResourcePolicy(options: DeployOptions): Promise<MissingResourcePolicy> {
	const explicit = normalizeMissingResourcePolicy(options.missingResource || process.env.DEPLOY_MISSING_RESOURCE_POLICY);
	if (explicit) {
		return explicit;
	}
	if (options.yes) {
		return 'auto';
	}
	return 'ask';
}

async function promptMissingResourceAction(resourceLabel: string): Promise<'auto' | 'manual' | 'fail'> {
	const answer = await inquirer.prompt([
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
	return answer.action as 'auto' | 'manual' | 'fail';
}

function resolveEffectiveMissingPolicy(basePolicy: MissingResourcePolicy, yes: boolean): MissingResourcePolicy {
	if (basePolicy === 'ask' && yes) {
		return 'auto';
	}
	return basePolicy;
}

async function resolveSkipMigrate(baseConfig: JsonObject, storageBackend: StorageBackend, options: DeployOptions): Promise<boolean> {
	if (options.skipMigrate !== undefined) {
		return options.skipMigrate;
	}
	const migrationApplicable = storageBackend === 'd1' && hasD1Binding(baseConfig);
	if (!migrationApplicable) {
		return true;
	}
	return false;
}

async function resolveSkipHealthcheck(options: DeployOptions): Promise<boolean> {
	if (options.skipHealthcheck !== undefined) {
		return options.skipHealthcheck;
	}
	return false;
}

function resolveEnvConfig(baseConfig: JsonObject, envName: string): JsonObject {
	const topLevel = deepClone(baseConfig);
	const envSection = ((baseConfig.env as JsonObject) || {})[envName] as JsonObject | undefined;
	delete topLevel.env;
	if (!envSection) {
		return topLevel;
	}
	for (const key of Array.from(NON_INHERITABLE_ENV_KEYS)) {
		delete topLevel[key];
	}
	return deepMerge(topLevel, envSection);
}

function assertRequiredFields(config: JsonObject): void {
	for (const field of ['name', 'main', 'compatibility_date']) {
		if (!config[field] || typeof config[field] !== 'string') {
			fail(`部署配置缺少必要字段: ${field}`);
		}
	}
}

function validateGeneratedConfig(config: JsonObject): string[] {
	const errors: string[] = [];

	const compatibilityDate = config.compatibility_date;
	if (typeof compatibilityDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(compatibilityDate)) {
		errors.push('compatibility_date 格式无效，应为 yyyy-mm-dd');
	}

	const main = config.main;
	if (typeof main === 'string') {
		const mainPath = path.isAbsolute(main) ? main : path.join(WORKDIR, main);
		if (!fs.existsSync(mainPath)) {
			errors.push(`main 指向的文件不存在: ${main}`);
		}
	}

	const assets = config.assets;
	if (assets && typeof assets === 'object' && !Array.isArray(assets)) {
		const directory = (assets as JsonObject).directory;
		if (typeof directory === 'string') {
			const dirPath = path.isAbsolute(directory) ? directory : path.join(WORKDIR, directory);
			if (!fs.existsSync(dirPath)) {
				errors.push(`assets.directory 不存在: ${directory}`);
			}
		}
	}

	const vars = config.vars;
	if (vars && (typeof vars !== 'object' || Array.isArray(vars))) {
		errors.push('vars 必须是对象');
	}

	return errors;
}

function toPosixPath(filePath: string): string {
	return filePath.replace(/\\/g, '/');
}

function toGeneratedRelativePath(rawPath: string, generatedDir: string): string {
	if (!rawPath.trim()) return rawPath;
	if (path.isAbsolute(rawPath)) {
		return toPosixPath(rawPath);
	}
	const absoluteTarget = path.join(WORKDIR, rawPath);
	let relativeTarget = path.relative(generatedDir, absoluteTarget);
	if (!relativeTarget.startsWith('.')) {
		relativeTarget = `./${relativeTarget}`;
	}
	return toPosixPath(relativeTarget);
}

function rewriteConfigPathsForGeneratedFile(config: JsonObject, generatedDir: string): JsonObject {
	const rewritten = deepClone(config);

	const stringPathKeys: Array<keyof JsonObject> = ['main', 'tsconfig', 'base_dir'];
	for (const key of stringPathKeys) {
		if (typeof rewritten[key] === 'string') {
			rewritten[key] = toGeneratedRelativePath(rewritten[key] as string, generatedDir);
		}
	}

	const build = rewritten.build;
	if (build && typeof build === 'object' && !Array.isArray(build)) {
		const buildObj = build as JsonObject;
		if (typeof buildObj.cwd === 'string') {
			buildObj.cwd = toGeneratedRelativePath(buildObj.cwd as string, generatedDir);
		}
		if (typeof buildObj.watch_dir === 'string') {
			buildObj.watch_dir = toGeneratedRelativePath(buildObj.watch_dir as string, generatedDir);
		} else if (Array.isArray(buildObj.watch_dir)) {
			buildObj.watch_dir = (buildObj.watch_dir as JsonArray).map((entry) =>
				typeof entry === 'string' ? toGeneratedRelativePath(entry, generatedDir) : entry,
			);
		}
	}

	const assets = rewritten.assets;
	if (assets && typeof assets === 'object' && !Array.isArray(assets)) {
		const assetsObj = assets as JsonObject;
		if (typeof assetsObj.directory === 'string') {
			assetsObj.directory = toGeneratedRelativePath(assetsObj.directory as string, generatedDir);
		}
	}

	const d1Databases = rewritten.d1_databases;
	if (Array.isArray(d1Databases)) {
		rewritten.d1_databases = d1Databases.map((entry) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
				return entry;
			}
			const db = deepClone(entry as JsonObject);
			if (typeof db.migrations_dir === 'string') {
				db.migrations_dir = toGeneratedRelativePath(db.migrations_dir as string, generatedDir);
			}
			return db;
		});
	}

	const site = rewritten.site;
	if (site && typeof site === 'object' && !Array.isArray(site)) {
		const siteObj = site as JsonObject;
		if (typeof siteObj.bucket === 'string') {
			siteObj.bucket = toGeneratedRelativePath(siteObj.bucket as string, generatedDir);
		}
	}

	return rewritten;
}

function getNpxBin(): string {
	return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function getCommandOutput(args: string[], timeout = 30000): string {
	const result = run(getNpxBin(), ['wrangler', ...args], { timeout });
	if (!result.ok) {
		throw new Error(result.stderr || result.stdout || `命令执行失败: wrangler ${args.join(' ')}`);
	}
	return result.stdout;
}

function ensureWranglerLogin(): void {
	logStep('Cloudflare 登录检查');
	const result = run(getNpxBin(), ['wrangler', 'whoami'], { timeout: 30000 });
	if (!result.ok) {
		console.log(result.stderr || result.stdout);
		fail('未登录 Cloudflare，请先执行: npx wrangler login');
	}
	logDone('Cloudflare 登录检查', '通过');
}

function toJsonc(value: JsonObject): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function ensureDeployFiles(envName: string, config: JsonObject): { generatedPath: string; redirectPath: string } {
	const generatedDir = path.join(DEPLOY_DIR, 'generated', envName);
	const generatedPath = path.join(generatedDir, 'wrangler.jsonc');
	const redirectPath = path.join(DEPLOY_DIR, 'config.json');

	fs.mkdirSync(generatedDir, { recursive: true });
	fs.writeFileSync(generatedPath, toJsonc(config), 'utf8');

	const relativeConfigPath = path.relative(DEPLOY_DIR, generatedPath).replace(/\\/g, '/');
	const redirectJson = { configPath: relativeConfigPath.startsWith('.') ? relativeConfigPath : `./${relativeConfigPath}` };
	fs.writeFileSync(redirectPath, `${JSON.stringify(redirectJson, null, 2)}\n`, 'utf8');

	return { generatedPath, redirectPath };
}

function runBuild(skipBuild = false): void {
	if (skipBuild) {
		logSkip('项目构建', '已跳过 (--skip-build)');
		return;
	}
	logStep('项目构建');
	const result = run('npm', ['run', 'build'], { timeout: 300000 });
	if (!result.ok) {
		console.log(result.stdout);
		console.log(result.stderr);
		fail('构建失败，已终止部署');
	}
	logDone('项目构建', '完成');
}

function upsertApiKeySecret(apiKey: string | undefined, workerName: string, generatedConfigPath: string): void {
	if (!apiKey) return;
	logStep('API_KEY Secret', `写入到 ${workerName}`);
	const result = run(getNpxBin(), ['wrangler', 'secret', 'put', 'API_KEY', '--name', workerName, '--config', generatedConfigPath], {
		input: `${apiKey}\n`,
		timeout: 120000,
	});
	if (!result.ok) {
		console.log(result.stdout);
		console.log(result.stderr);
		fail('写入 API_KEY secret 失败');
	}
	logDone('API_KEY Secret', '写入成功');
}

function listD1Databases(): Array<{ uuid: string; name: string }> {
	return JSON.parse(getCommandOutput(['d1', 'list', '--json'], 30000)) as Array<{ uuid: string; name: string }>;
}

function listKVNamespaces(): Array<{ id: string; title: string }> {
	return JSON.parse(getCommandOutput(['kv', 'namespace', 'list'], 30000)) as Array<{ id: string; title: string }>;
}

function listR2Buckets(): Array<{ name: string }> {
	return JSON.parse(getCommandOutput(['r2', 'bucket', 'list'], 30000)) as Array<{ name: string }>;
}

async function selectD1Database(binding: D1BindingConfig, nonInteractive: boolean): Promise<ResourceInfo | null> {
	logStep('D1 资源', '获取数据库列表');
	try {
		const dbs = listD1Databases();
		if (dbs.length === 0) {
			logWarn('未找到任何 D1 数据库');
			return null;
		}
		if (nonInteractive) {
			fail(`D1 ${binding.binding} 缺失，且当前为非交互模式`);
		}
		const answers = await inquirer.prompt([
			{
				type: 'list',
				name: 'databaseId',
				message: `选择要绑定到 ${binding.binding} 的 D1 数据库:`,
				choices: dbs.map((db) => ({ name: `${db.name} (${db.uuid})`, value: db.uuid })),
			},
		]);
		const selected = dbs.find((db) => db.uuid === answers.databaseId);
		return selected ? { type: 'd1', binding: binding.binding, id: selected.uuid, name: selected.name, status: 'existing' } : null;
	} catch (error) {
		logWarn(`获取 D1 列表失败: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

async function selectKVNamespace(binding: string, nonInteractive: boolean): Promise<ResourceInfo | null> {
	logStep('KV 资源', '获取命名空间列表');
	try {
		const namespaces = listKVNamespaces();
		if (namespaces.length === 0) {
			logWarn('未找到任何 KV 命名空间');
			return null;
		}
		if (nonInteractive) {
			fail(`KV ${binding} 缺失，且当前为非交互模式`);
		}
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
		logWarn(`获取 KV 列表失败: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

async function selectR2Bucket(binding: R2BindingConfig, nonInteractive: boolean): Promise<ResourceInfo | null> {
	logStep('R2 资源', '获取存储桶列表');
	try {
		const buckets = listR2Buckets();
		if (buckets.length === 0) {
			logWarn('未找到任何 R2 存储桶');
			return null;
		}
		if (nonInteractive) {
			fail(`R2 ${binding.binding} 缺失，且当前为非交互模式`);
		}
		const answers = await inquirer.prompt([
			{
				type: 'list',
				name: 'bucketName',
				message: `选择要绑定到 ${binding.binding} 的 R2 存储桶:`,
				choices: buckets.map((bucket) => ({ name: bucket.name, value: bucket.name })),
			},
		]);
		return { type: 'r2', binding: binding.binding, id: answers.bucketName as string, status: 'existing' };
	} catch (error) {
		logWarn(`获取 R2 列表失败: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

async function ensureD1Database(binding: D1BindingConfig, missingResourcePolicy: MissingResourcePolicy, yes: boolean, nonInteractive: boolean): Promise<ResourceInfo> {
	logStep('D1 资源检查', `${binding.binding} -> ${binding.database_name}`);
	try {
		const dbs = listD1Databases();
		const existing = dbs.find((db) => db.name === binding.database_name || db.uuid === binding.database_id);
		if (existing) {
			logDone('D1 资源检查', `${binding.binding} -> ${existing.name} (${existing.uuid})`);
			return { type: 'd1', binding: binding.binding, id: existing.uuid, name: existing.name, status: 'existing' };
		}
	} catch {
		logStep('D1 资源检查', '未找到现有数据库');
	}
	const policy = resolveEffectiveMissingPolicy(missingResourcePolicy, yes);
	const action = policy === 'ask' ? await promptMissingResourceAction(`D1 ${binding.binding}`) : policy;
	if (action === 'fail') {
		return { type: 'd1', binding: binding.binding, id: '', status: 'pending' };
	}
	if (action === 'manual') {
		return (await selectD1Database(binding, nonInteractive)) || { type: 'd1', binding: binding.binding, id: '', status: 'pending' };
	}
	let retries = 3;
	while (retries > 0) {
		try {
			const output = getCommandOutput(['d1', 'create', binding.database_name], 60000);
			const idMatch = output.match(/([a-f0-9-]{36})/i);
			if (idMatch) {
				logDone('D1 资源创建', `${binding.database_name} (${idMatch[1]})`);
				return { type: 'd1', binding: binding.binding, id: idMatch[1], name: binding.database_name, status: 'created' };
			}
			const refreshed = listD1Databases().find((db) => db.name === binding.database_name);
			if (refreshed) {
				return { type: 'd1', binding: binding.binding, id: refreshed.uuid, name: refreshed.name, status: 'created' };
			}
			break;
		} catch (error) {
			retries -= 1;
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes('already exists')) {
				const refreshed = listD1Databases().find((db) => db.name === binding.database_name);
				if (refreshed) {
					return { type: 'd1', binding: binding.binding, id: refreshed.uuid, name: refreshed.name, status: 'existing' };
				}
			}
			if (retries > 0) {
				logSkip('D1 资源创建', `失败，剩余重试 ${retries} 次`);
				await new Promise((resolve) => setTimeout(resolve, 3000));
			} else {
				logSkip('D1 资源创建', `失败 - ${message}`);
			}
		}
	}
	return (await selectD1Database(binding, nonInteractive)) || { type: 'd1', binding: binding.binding, id: '', status: 'pending' };
}

async function createD1DatabaseWithPrompt(defaultName: string): Promise<ResourceInfo | null> {
	const answer = await inquirer.prompt([
		{
			type: 'input',
			name: 'databaseName',
			message: '输入要创建的 D1 数据库名称',
			default: defaultName,
			validate: (value: string) => (value.trim() ? true : '数据库名称不能为空'),
		},
	]);
	const databaseName = (answer.databaseName as string).trim();
	try {
		const output = getCommandOutput(['d1', 'create', databaseName], 60000);
		const idMatch = output.match(/([a-f0-9-]{36})/i);
		if (idMatch) {
			logDone('D1 资源创建', `${databaseName} (${idMatch[1]})`);
			return { type: 'd1', binding: databaseName, id: idMatch[1], name: databaseName, status: 'created' };
		}
		const refreshed = listD1Databases().find((db) => db.name === databaseName);
		if (refreshed) {
			logDone('D1 资源创建', `${refreshed.name} (${refreshed.uuid})`);
			return { type: 'd1', binding: databaseName, id: refreshed.uuid, name: refreshed.name, status: 'created' };
		}
		logSkip('D1 资源创建', '创建成功但未解析到数据库 ID');
		return null;
	} catch (error) {
		logSkip('D1 资源创建', `失败 - ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

function getCreateOptionLabel(resourceType: 'd1' | 'kv' | 'r2'): string {
	switch (resourceType) {
		case 'd1':
			return '创建新的 D1 数据库';
		case 'kv':
			return '创建新的 KV 命名空间';
		case 'r2':
			return '创建新的 R2 存储桶';
	}
}

function getSelectMessage(resourceType: 'd1' | 'kv' | 'r2', binding: string): string {
	switch (resourceType) {
		case 'd1':
			return `为 ${binding} 选择 D1 数据库`;
		case 'kv':
			return `为 ${binding} 选择 KV 命名空间`;
		case 'r2':
			return `为 ${binding} 选择 R2 存储桶`;
	}
}

async function createKVNamespaceWithPrompt(defaultName: string): Promise<ResourceInfo | null> {
	const answer = await inquirer.prompt([
		{
			type: 'input',
			name: 'namespaceTitle',
			message: '输入要创建的 KV 命名空间名称',
			default: defaultName,
			validate: (value: string) => (value.trim() ? true : '命名空间名称不能为空'),
		},
	]);
	const namespaceTitle = (answer.namespaceTitle as string).trim();
	try {
		const output = getCommandOutput(['kv', 'namespace', 'create', namespaceTitle], 60000);
		const idMatch = output.match(/([a-f0-9-]{32,36})/i);
		if (idMatch) {
			logDone('KV 资源创建', `${namespaceTitle} (${idMatch[1]})`);
			return { type: 'kv', binding: namespaceTitle, id: idMatch[1], status: 'created' };
		}
		const refreshed = listKVNamespaces().find((ns) => ns.title === namespaceTitle);
		if (refreshed) {
			logDone('KV 资源创建', `${refreshed.title} (${refreshed.id})`);
			return { type: 'kv', binding: namespaceTitle, id: refreshed.id, status: 'created' };
		}
		logSkip('KV 资源创建', '创建成功但未解析到 KV ID');
		return null;
	} catch (error) {
		logSkip('KV 资源创建', `失败 - ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

async function createR2BucketWithPrompt(defaultName: string): Promise<ResourceInfo | null> {
	const answer = await inquirer.prompt([
		{
			type: 'input',
			name: 'bucketName',
			message: '输入要创建的 R2 存储桶名称',
			default: defaultName,
			validate: (value: string) => (value.trim() ? true : '存储桶名称不能为空'),
		},
	]);
	const bucketName = (answer.bucketName as string).trim();
	try {
		getCommandOutput(['r2', 'bucket', 'create', bucketName], 60000);
		logDone('R2 资源创建', bucketName);
		return { type: 'r2', binding: bucketName, id: bucketName, status: 'created' };
	} catch (error) {
		logSkip('R2 资源创建', `失败 - ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

async function ensureKVNamespace(binding: KVBindingConfig, missingResourcePolicy: MissingResourcePolicy, yes: boolean, nonInteractive: boolean): Promise<ResourceInfo> {
	logStep('KV 资源检查', binding.binding);
	try {
		const namespaces = listKVNamespaces();
		const existing = namespaces.find((ns) => ns.title === binding.binding || ns.id === binding.id);
		if (existing) {
			logDone('KV 资源检查', `${binding.binding} -> ${existing.title} (${existing.id})`);
			return { type: 'kv', binding: binding.binding, id: existing.id, status: 'existing' };
		}
	} catch {
		logStep('KV 资源检查', '未找到现有命名空间');
	}
	const policy = resolveEffectiveMissingPolicy(missingResourcePolicy, yes);
	const action = policy === 'ask' ? await promptMissingResourceAction(`KV ${binding.binding}`) : policy;
	if (action === 'fail') {
		return { type: 'kv', binding: binding.binding, id: '', status: 'pending' };
	}
	if (action === 'manual') {
		return (await selectKVNamespace(binding.binding, nonInteractive)) || { type: 'kv', binding: binding.binding, id: '', status: 'pending' };
	}
	let retries = 3;
	while (retries > 0) {
		try {
			const output = getCommandOutput(['kv', 'namespace', 'create', binding.binding], 60000);
			const idMatch = output.match(/([a-f0-9-]{32,36})/i);
			if (idMatch) {
				logDone('KV 资源创建', `${binding.binding} (${idMatch[1]})`);
				return { type: 'kv', binding: binding.binding, id: idMatch[1], status: 'created' };
			}
			const refreshed = listKVNamespaces().find((ns) => ns.title === binding.binding);
			if (refreshed) {
				return { type: 'kv', binding: binding.binding, id: refreshed.id, status: 'created' };
			}
			break;
		} catch (error) {
			retries -= 1;
			const message = error instanceof Error ? error.message : String(error);
			if (retries > 0) {
				logSkip('KV 资源创建', `失败，剩余重试 ${retries} 次`);
				await new Promise((resolve) => setTimeout(resolve, 3000));
			} else {
				logSkip('KV 资源创建', `失败 - ${message}`);
			}
		}
	}
	return (await selectKVNamespace(binding.binding, nonInteractive)) || { type: 'kv', binding: binding.binding, id: '', status: 'pending' };
}

async function ensureR2Bucket(binding: R2BindingConfig, missingResourcePolicy: MissingResourcePolicy, yes: boolean, nonInteractive: boolean): Promise<ResourceInfo> {
	logStep('R2 资源检查', `${binding.binding} -> ${binding.bucket_name}`);
	try {
		const buckets = listR2Buckets();
		const existing = buckets.find((bucket) => bucket.name === binding.bucket_name);
		if (existing) {
			logDone('R2 资源检查', `${binding.binding} -> ${existing.name}`);
			return { type: 'r2', binding: binding.binding, id: existing.name, status: 'existing' };
		}
	} catch {
		logStep('R2 资源检查', '未找到现有存储桶');
	}
	const policy = resolveEffectiveMissingPolicy(missingResourcePolicy, yes);
	const action = policy === 'ask' ? await promptMissingResourceAction(`R2 ${binding.binding}`) : policy;
	if (action === 'fail') {
		return { type: 'r2', binding: binding.binding, id: '', status: 'pending' };
	}
	if (action === 'manual') {
		return (await selectR2Bucket(binding, nonInteractive)) || { type: 'r2', binding: binding.binding, id: '', status: 'pending' };
	}
	try {
		getCommandOutput(['r2', 'bucket', 'create', binding.bucket_name], 60000);
		logDone('R2 资源创建', binding.bucket_name);
		return { type: 'r2', binding: binding.binding, id: binding.bucket_name, status: 'created' };
	} catch (error) {
		logSkip('R2 资源创建', `失败 - ${error instanceof Error ? error.message : String(error)}`);
	}
	return (await selectR2Bucket(binding, nonInteractive)) || { type: 'r2', binding: binding.binding, id: '', status: 'pending' };
}

function getD1Bindings(config: JsonObject): D1BindingConfig[] {
	if (Array.isArray(config.d1_databases) && config.d1_databases.length > 0) {
		return (config.d1_databases as JsonValue[])
			.filter((entry): entry is JsonObject => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
			.map((entry) => entry as unknown as D1BindingConfig);
	}

	return [
		{
			binding: 'JSONBASE_DB',
			database_name: 'jsonbase',
		},
	];
}

function getKVBindings(config: JsonObject): KVBindingConfig[] {
	if (Array.isArray(config.kv_namespaces) && config.kv_namespaces.length > 0) {
		return (config.kv_namespaces as JsonValue[])
			.filter((entry): entry is JsonObject => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
			.map((entry) => entry as unknown as KVBindingConfig);
	}

	const vars = config.vars;
	const kvBinding =
		vars && typeof vars === 'object' && !Array.isArray(vars) && typeof (vars as JsonObject).KV_NAMESPACE === 'string'
			? ((vars as JsonObject).KV_NAMESPACE as string)
			: 'JSONBIN';

	return [{ binding: kvBinding }];
}

function getR2Bindings(config: JsonObject): R2BindingConfig[] {
	if (!Array.isArray(config.r2_buckets)) return [];
	return (config.r2_buckets as JsonValue[]).filter((entry): entry is JsonObject => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)).map((entry) => entry as unknown as R2BindingConfig);
}

async function promptResourceBindings(config: JsonObject, storageBackend: StorageBackend, allowCreate: boolean): Promise<ResourceInfo[]> {
	const resources: ResourceInfo[] = [];

	for (const binding of storageBackend === 'd1' ? getD1Bindings(config) : []) {
		const databases = listD1Databases();
		if (databases.length === 0 && !allowCreate) {
			logWarn(`未找到可选 D1 数据库，预览模式下跳过 ${binding.binding} 绑定选择`);
			continue;
		}
		const defaultDatabase = databases.find((db) => db.uuid === binding.database_id || db.name === binding.database_name);
		const answers = await inquirer.prompt([
			{
				type: 'list',
				name: 'databaseId',
				message: getSelectMessage('d1', binding.binding),
				choices: [
					...(allowCreate ? [{ name: getCreateOptionLabel('d1'), value: '__create_new__' }] : []),
					...databases.map((db) => ({ name: `${db.name} (${db.uuid})`, value: db.uuid })),
				],
				default: defaultDatabase?.uuid || (allowCreate ? '__create_new__' : databases[0]?.uuid),
			},
		]);
		if (answers.databaseId === '__create_new__') {
			const created = await createD1DatabaseWithPrompt(binding.database_name);
			resources.push(created ? { ...created, binding: binding.binding } : { type: 'd1', binding: binding.binding, id: '', status: 'pending' });
		} else {
			const selected = databases.find((db) => db.uuid === answers.databaseId);
			resources.push({ type: 'd1', binding: binding.binding, id: answers.databaseId as string, name: selected?.name || binding.database_name, status: 'existing' });
		}
	}

	for (const binding of storageBackend === 'kv' ? getKVBindings(config) : []) {
		const namespaces = listKVNamespaces();
		if (namespaces.length === 0 && !allowCreate) {
			logWarn(`未找到可选 KV 命名空间，预览模式下跳过 ${binding.binding} 绑定选择`);
			continue;
		}
		const defaultNamespace = namespaces.find((ns) => ns.id === binding.id || ns.title === binding.binding);
		const answers = await inquirer.prompt([
			{
				type: 'list',
				name: 'namespaceId',
				message: getSelectMessage('kv', binding.binding),
				choices: [
					...(allowCreate ? [{ name: getCreateOptionLabel('kv'), value: '__create_new__' }] : []),
					...namespaces.map((ns) => ({ name: `${ns.title} (${ns.id})`, value: ns.id })),
				],
				default: defaultNamespace?.id || (allowCreate ? '__create_new__' : namespaces[0]?.id),
			},
		]);
		if (answers.namespaceId === '__create_new__') {
			const created = await createKVNamespaceWithPrompt(binding.binding);
			resources.push(created ? { ...created, binding: binding.binding } : { type: 'kv', binding: binding.binding, id: '', status: 'pending' });
		} else {
			resources.push({ type: 'kv', binding: binding.binding, id: answers.namespaceId as string, status: 'existing' });
		}
	}

	for (const binding of getR2Bindings(config)) {
		const buckets = listR2Buckets();
		if (buckets.length === 0 && !allowCreate) {
			logWarn(`未找到可选 R2 存储桶，预览模式下跳过 ${binding.binding} 绑定选择`);
			continue;
		}
		const defaultBucket = buckets.find((bucket) => bucket.name === binding.bucket_name);
		const answers = await inquirer.prompt([
			{
				type: 'list',
				name: 'bucketName',
				message: getSelectMessage('r2', binding.binding),
				choices: [
					...(allowCreate ? [{ name: getCreateOptionLabel('r2'), value: '__create_new__' }] : []),
					...buckets.map((bucket) => ({ name: bucket.name, value: bucket.name })),
				],
				default: defaultBucket?.name || (allowCreate ? '__create_new__' : buckets[0]?.name),
			},
		]);
		if (answers.bucketName === '__create_new__') {
			const created = await createR2BucketWithPrompt(binding.bucket_name);
			resources.push(created ? { ...created, binding: binding.binding } : { type: 'r2', binding: binding.binding, id: '', status: 'pending' });
		} else {
			resources.push({ type: 'r2', binding: binding.binding, id: answers.bucketName as string, status: 'existing' });
		}
	}

	return resources;
}

async function ensureResources(
	config: JsonObject,
	storageBackend: StorageBackend,
	missingResourcePolicy: MissingResourcePolicy,
	options: DeployOptions,
	initialResources: ResourceInfo[] = [],
): Promise<ResourceInfo[]> {
	const resources: ResourceInfo[] = [];
	const yes = parseBooleanFlag(options.yes);
	const nonInteractive = isNonInteractiveMode(options);
	const existingKeys = new Set(initialResources.map((resource) => `${resource.type}:${resource.binding}`));
	resources.push(...initialResources);

	if (storageBackend === 'd1') {
		for (const entry of getD1Bindings(config)) {
			if (!existingKeys.has(`d1:${entry.binding}`)) {
				resources.push(await ensureD1Database(entry, missingResourcePolicy, yes, nonInteractive));
			}
		}
	}

	if (storageBackend === 'kv') {
		for (const entry of getKVBindings(config)) {
			if (!existingKeys.has(`kv:${entry.binding}`)) {
				resources.push(await ensureKVNamespace(entry, missingResourcePolicy, yes, nonInteractive));
			}
		}
	}

	for (const entry of getR2Bindings(config)) {
		if (!existingKeys.has(`r2:${entry.binding}`)) {
			resources.push(await ensureR2Bucket(entry, missingResourcePolicy, yes, nonInteractive));
		}
	}

	return resources;
}

function applyResolvedResources(config: JsonObject, resources: ResourceInfo[]): JsonObject {
	const nextConfig = deepClone(config);
	const d1Map = new Map(resources.filter((resource) => resource.type === 'd1' && resource.id).map((resource) => [resource.binding, resource.id]));
	const d1NameMap = new Map(resources.filter((resource) => resource.type === 'd1' && resource.id).map((resource) => [resource.binding, resource.name || 'jsonbase']));
	const kvMap = new Map(resources.filter((resource) => resource.type === 'kv' && resource.id).map((resource) => [resource.binding, resource.id]));
	const r2Map = new Map(resources.filter((resource) => resource.type === 'r2' && resource.id).map((resource) => [resource.binding, resource.id]));

	if (Array.isArray(nextConfig.d1_databases)) {
		nextConfig.d1_databases = (nextConfig.d1_databases as JsonValue[]).map((entry) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
			const db = deepClone(entry as JsonObject);
			const binding = typeof db.binding === 'string' ? db.binding : '';
			const resourceId = d1Map.get(binding);
			const resourceName = d1NameMap.get(binding);
			if (resourceId) {
				db.database_id = resourceId;
			}
			if (resourceName) {
				db.database_name = resourceName;
			}
			return db;
		});
	} else if (d1Map.size > 0) {
		nextConfig.d1_databases = Array.from(d1Map.entries()).map(([binding, id]) => ({
			binding,
			database_id: id,
			database_name: d1NameMap.get(binding) || (binding === 'JSONBASE_DB' ? 'jsonbase' : binding.toLowerCase()),
		}));
	}

	if (Array.isArray(nextConfig.kv_namespaces)) {
		nextConfig.kv_namespaces = (nextConfig.kv_namespaces as JsonValue[]).map((entry) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
			const ns = deepClone(entry as JsonObject);
			const binding = typeof ns.binding === 'string' ? ns.binding : '';
			const resourceId = kvMap.get(binding);
			if (resourceId) {
				ns.id = resourceId;
			}
			return ns;
		});
	} else if (kvMap.size > 0) {
		nextConfig.kv_namespaces = Array.from(kvMap.entries()).map(([binding, id]) => ({
			binding,
			id,
			preview_id: id,
		}));
	}

	if (!nextConfig.vars || typeof nextConfig.vars !== 'object' || Array.isArray(nextConfig.vars)) {
		nextConfig.vars = {};
	}
	if (kvMap.size > 0) {
		const firstBinding = kvMap.keys().next().value;
		if (typeof firstBinding === 'string' && firstBinding) {
			(nextConfig.vars as JsonObject).KV_NAMESPACE = firstBinding;
		}
	}
	if (d1Map.size > 0) {
		(nextConfig.vars as JsonObject).D1_BINDING = Array.from(d1Map.keys())[0];
	}

	if (Array.isArray(nextConfig.r2_buckets)) {
		nextConfig.r2_buckets = (nextConfig.r2_buckets as JsonValue[]).map((entry) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
			const bucket = deepClone(entry as JsonObject);
			const binding = typeof bucket.binding === 'string' ? bucket.binding : '';
			const resourceId = r2Map.get(binding);
			if (resourceId) {
				bucket.bucket_name = resourceId;
			}
			return bucket;
		});
	}

	return nextConfig;
}

function runMigrations(config: JsonObject, generatedConfigPath: string): void {
	const schemaPath = path.join(WORKDIR, 'src', 'database', 'schema.sql');
	if (!fs.existsSync(schemaPath)) {
		logSkip('数据库迁移', `迁移文件不存在 - ${path.relative(WORKDIR, schemaPath)}`);
		return;
	}
	const d1Databases = config.d1_databases;
	if (!Array.isArray(d1Databases) || d1Databases.length === 0) {
		logSkip('数据库迁移', '当前配置没有 D1 绑定');
		return;
	}
	const firstDb = d1Databases[0];
	if (!firstDb || typeof firstDb !== 'object' || Array.isArray(firstDb)) {
		logSkip('数据库迁移', 'D1 绑定配置异常');
		return;
	}
	const binding = (firstDb as JsonObject).binding;
	const databaseName = (firstDb as JsonObject).database_name;
	const databaseRef = typeof binding === 'string' && binding.trim() ? binding : databaseName;
	if (typeof databaseRef !== 'string' || !databaseRef.trim()) {
		logSkip('数据库迁移', '未找到可用的 D1 binding/database_name');
		return;
	}
	logStep('数据库迁移', databaseRef);
	const result = run(getNpxBin(), ['wrangler', 'd1', 'execute', databaseRef, '--remote', `--file=${schemaPath}`, '--config', generatedConfigPath], {
		timeout: 120000,
	});
	if (!result.ok) {
		console.log(result.stdout);
		console.log(result.stderr);
		fail('数据库迁移失败');
	}
	logDone('数据库迁移', '完成');
}

async function runHealthcheck(config: JsonObject): Promise<void> {
	const workerUrl = `https://${getWorkerName(config)}.workers.dev/._jsondb_/api/health`;
	logStep('健康检查', workerUrl);
	try {
		const response = await fetch(workerUrl, { signal: AbortSignal.timeout(15000) });
		if (!response.ok) {
			logSkip('健康检查', `返回状态 ${response.status}`);
			return;
		}
		const payload = (await response.json()) as { status?: string };
		logDone('健康检查', payload.status || '通过');
	} catch (error) {
		logSkip('健康检查', `失败 - ${error instanceof Error ? error.message : String(error)}`);
	}
}

function buildDeployArgs(options: DeployOptions, generatedConfigPath: string): string[] {
	const args = ['wrangler', 'deploy', '--config', generatedConfigPath];
	if (options.dryRun) {
		args.push('--dry-run');
	}
	if (options.keepVars) {
		args.push('--keep-vars');
	}
	return args;
}

async function deploy(options: DeployOptions): Promise<void> {
	if (!fs.existsSync(WRANGLER_TOML_PATH)) {
		fail('未找到 wrangler.toml');
	}

	ensureWranglerLogin();

	const baseConfig = parseTomlLite(readText(WRANGLER_TOML_PATH));
	const envName = await resolveEnvironment(baseConfig, options);
	const storageBackend = await resolveStorageBackend(baseConfig, options);
	const missingResourcePolicy = await resolveMissingResourcePolicy(options);
	const skipMigrate = await resolveSkipMigrate(baseConfig, storageBackend, options);
	const skipHealthcheck = await resolveSkipHealthcheck(options);
	let finalConfig = resolveEnvConfig(baseConfig, envName);

	const envVarsFromFiles: Record<string, string> = {};
	for (const file of options.envFile || []) {
		Object.assign(envVarsFromFiles, parseEnvFile(file));
	}

	if (!finalConfig.vars || typeof finalConfig.vars !== 'object' || Array.isArray(finalConfig.vars)) {
		finalConfig.vars = {};
	}
	(finalConfig.vars as JsonObject).STORAGE_BACKEND = storageBackend;
	for (const [key, value] of Object.entries(envVarsFromFiles)) {
		(finalConfig.vars as JsonObject)[key] = value;
	}
	for (const variable of options.var || []) {
		const [key, value] = parseVarPair(variable);
		(finalConfig.vars as JsonObject)[key] = value;
	}

	if (options.confFile) {
		const overrides = parseConfigFile(options.confFile);
		finalConfig = deepMerge(finalConfig, overrides);
	}

	const preselectedResources = !isNonInteractiveMode(options) ? await promptResourceBindings(finalConfig, storageBackend, true) : [];
	const resources = !isNonInteractiveMode(options) ? preselectedResources : options.plan || options.dryRun ? [] : await ensureResources(finalConfig, storageBackend, missingResourcePolicy, options, preselectedResources);
	const missingResources = resources.filter((resource) => !resource.id);
	if (missingResources.length > 0) {
		fail(`部署失败: 以下资源缺少 ID: ${missingResources.map((resource) => `${resource.type}.${resource.binding}`).join(', ')}`);
	}
	finalConfig = applyResolvedResources(finalConfig, resources);

	delete finalConfig.env;

	const schemaAllowList = getSchemaAllowList(WRANGLER_SCHEMA_PATH);
	finalConfig = sanitizeConfigBySchema(finalConfig, schemaAllowList);

	assertRequiredFields(finalConfig);
	checkSensitiveVars(finalConfig);
	const validationErrors = validateGeneratedConfig(finalConfig);
	if (validationErrors.length > 0) {
		for (const message of validationErrors) {
			logError(message);
		}
		fail('生成配置校验失败');
	}

	const generatedPath = path.join(DEPLOY_DIR, 'generated', envName, 'wrangler.jsonc');
	const generatedDir = path.dirname(generatedPath);
	const redirectPath = path.join(DEPLOY_DIR, 'config.json');
	const generatedPathRelative = path.relative(WORKDIR, generatedPath);
	finalConfig = rewriteConfigPathsForGeneratedFile(finalConfig, generatedDir);

	const deployArgs = buildDeployArgs(options, generatedPath);
	const previewCommand = `${getNpxBin()} ${deployArgs.join(' ')}`;

	if (options.dryRun) {
		console.log(chalk.cyan('\n[DRY-RUN] 配置预览 (不会写入文件，不会部署)'));
		console.log(`环境: ${envName}`);
		console.log(`存储后端: ${storageBackend}`);
		console.log(`缺失资源策略: ${missingResourcePolicy}`);
		console.log(`数据库迁移: ${skipMigrate ? '跳过' : '执行'}`);
		console.log(`健康检查: ${skipHealthcheck ? '跳过' : '执行'}`);
		console.log(`计划生成: ${generatedPathRelative}`);
		console.log('\n--- wrangler.jsonc ---');
		console.log(toJsonc(finalConfig).trim());
		console.log('--- end ---\n');
		logSuccess('配置校验通过');
		return;
	}

	if (options.plan) {
		console.log(chalk.cyan('\n[PLAN] 部署计划'));
		console.log(`环境: ${envName}`);
		console.log(`存储后端: ${storageBackend}`);
		console.log(`缺失资源策略: ${missingResourcePolicy}`);
		console.log(`数据库迁移: ${skipMigrate ? '跳过' : '执行'}`);
		console.log(`健康检查: ${skipHealthcheck ? '跳过' : '执行'}`);
		console.log(`配置: ${generatedPathRelative}`);
		console.log(`重定向: ${path.relative(WORKDIR, redirectPath)}`);
		console.log(`命令: ${previewCommand}`);
		if (resources.length > 0) {
			console.log(`资源: ${resources.map((resource) => `${resource.type}.${resource.binding}=${resource.id || 'pending'}`).join(', ')}`);
		}
		return;
	}

	const writtenFiles = ensureDeployFiles(envName, finalConfig);
	logDone('部署配置生成', path.relative(WORKDIR, writtenFiles.generatedPath));
	logDone('配置重定向生成', path.relative(WORKDIR, writtenFiles.redirectPath));

	const apiKey = await resolveApiKey(options);

	if (!apiKey) {
		logSkip('API_KEY Secret', '未检测到 API_KEY，跳过写入');
	}

	if (!skipMigrate) {
		runMigrations(finalConfig, writtenFiles.generatedPath);
	}

	runBuild(Boolean(options.skipBuild));
	upsertApiKeySecret(apiKey, getWorkerName(finalConfig), writtenFiles.generatedPath);

	logStep('Worker 部署', previewCommand);
	const deployResult = run(getNpxBin(), deployArgs, { timeout: 300000 });
	if (!deployResult.ok) {
		console.log(deployResult.stdout);
		console.log(deployResult.stderr);
		fail('部署失败');
	}

	console.log(deployResult.stdout.trim());
	if (!skipHealthcheck) {
		await runHealthcheck(finalConfig);
	}
	logDone('Worker 部署', options.dryRun ? 'dry-run 执行成功' : '部署成功');
}

function doctor(): void {
	const checks = [
		{ name: 'wrangler.toml', ok: fs.existsSync(WRANGLER_TOML_PATH) },
		{ name: 'wrangler schema', ok: fs.existsSync(WRANGLER_SCHEMA_PATH) },
	];

	for (const check of checks) {
		if (check.ok) {
			logSuccess(`检查通过: ${check.name}`);
		} else {
			logError(`检查失败: ${check.name}`);
		}
	}

	const login = run(getNpxBin(), ['wrangler', 'whoami'], { timeout: 20000 });
	if (login.ok) {
		logSuccess('Cloudflare 已登录');
	} else {
		logWarn('Cloudflare 未登录 (执行 npx wrangler login)');
	}
}

async function printConfig(options: DeployOptions): Promise<void> {
	const baseConfig = parseTomlLite(readText(WRANGLER_TOML_PATH));
	const envName = await resolveEnvironment(baseConfig, options);
	const storageBackend = await resolveStorageBackend(baseConfig, options);
	let finalConfig = resolveEnvConfig(baseConfig, envName);
	if (!finalConfig.vars || typeof finalConfig.vars !== 'object' || Array.isArray(finalConfig.vars)) {
		finalConfig.vars = {};
	}
	(finalConfig.vars as JsonObject).STORAGE_BACKEND = storageBackend;
	if (options.confFile) {
		finalConfig = deepMerge(finalConfig, parseConfigFile(options.confFile));
	}
	delete finalConfig.env;
	const schemaAllowList = getSchemaAllowList(WRANGLER_SCHEMA_PATH);
	finalConfig = sanitizeConfigBySchema(finalConfig, schemaAllowList);
	checkSensitiveVars(finalConfig);
	console.log(toJsonc(finalConfig));
}

const program = new Command();

program.name('deploy-cli').description('Cloudflare Worker 动态部署 CLI').version('5.0.0');

program
	.command('deploy')
	.description('生成动态 wrangler 配置并部署')
	.option('--env <environment>', '部署环境')
	.option('--storage <backend>', '存储后端: d1|kv')
	.option('--missing-resource <policy>', '缺失资源策略: ask|auto|manual|fail')
	.option('--plan', '只输出执行计划，不执行部署')
	.option('--dry-run', '执行 wrangler deploy --dry-run')
	.option('--conf-file <path>', '覆盖生成配置的 wrangler.jsonc/json/toml 文件')
	.option('--var <keyValue>', '追加变量，格式 KEY:VALUE', (value: string, previous: string[] = []) => [...previous, value], [])
	.option('--env-file <path>', '加载环境变量文件，格式 KEY=VALUE', (value: string, previous: string[] = []) => [...previous, value], [])
	.option('--keep-vars', '部署时启用 --keep-vars')
	.option('--non-interactive', '禁用交互模式')
	.option('--yes', '使用推荐默认值')
	.option('--skip-migrate', '跳过数据库迁移')
	.option('--skip-healthcheck', '跳过健康检查')
	.option('--skip-build', '跳过构建')
	.option('--api-key <key>', '写入 API_KEY secret')
	.action(async (options: DeployOptions) => {
		await deploy(options);
	});

program.command('doctor').description('检查部署基础状态').action(doctor);

program
	.command('print-config')
	.description('打印最终生成的部署配置')
	.option('--env <environment>', '部署环境')
	.option('--storage <backend>', '存储后端: d1|kv')
	.option('--conf-file <path>', '覆盖生成配置的 wrangler.jsonc/json/toml 文件')
	.option('--non-interactive', '禁用交互模式')
	.action(async (options: DeployOptions) => {
		await printConfig(options);
	});

program.parse();
