import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonArray = JsonValue[];
type JsonObject = { [key: string]: JsonValue };

interface DeployOptions {
	env?: string;
	plan?: boolean;
	dryRun?: boolean;
	confFile?: string;
	var?: string[];
	envFile?: string[];
	keepVars?: boolean;
	nonInteractive?: boolean;
	yes?: boolean;
	skipBuild?: boolean;
	apiKey?: string;
}

const WORKDIR = process.cwd();
const WRANGLER_TOML_PATH = path.join(WORKDIR, 'wrangler.toml');
const WRANGLER_SCHEMA_PATH = path.join(WORKDIR, 'node_modules', 'wrangler', 'config-schema.json');
const DEPLOY_DIR = path.join(WORKDIR, '.wrangler', 'deploy');
const SENSITIVE_VAR_KEYS = new Set(['API_KEY']);
const NON_INHERITABLE_ENV_KEYS = new Set([
	'define',
	'vars',
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

async function resolveEnvironment(baseConfig: JsonObject, options: DeployOptions): Promise<string> {
	if (options.env) return options.env;
	const envs = Object.keys((baseConfig.env as JsonObject) || {});
	if (options.nonInteractive) {
		return envs.includes('development') ? 'development' : envs[0] || 'development';
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

function ensureWranglerLogin(): void {
	logInfo('检查 Cloudflare 登录状态...');
	const result = run(getNpxBin(), ['wrangler', 'whoami'], { timeout: 30000 });
	if (!result.ok) {
		console.log(result.stderr || result.stdout);
		fail('未登录 Cloudflare，请先执行: npx wrangler login');
	}
	logSuccess('Cloudflare 登录状态正常');
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
		logWarn('跳过构建阶段 (--skip-build)');
		return;
	}
	logInfo('执行项目构建...');
	const result = run('npm', ['run', 'build'], { timeout: 300000 });
	if (!result.ok) {
		console.log(result.stdout);
		console.log(result.stderr);
		fail('构建失败，已终止部署');
	}
	logSuccess('构建完成');
}

function upsertApiKeySecret(apiKey: string | undefined): void {
	if (!apiKey) return;
	logInfo('写入 API_KEY secret...');
	const result = run(getNpxBin(), ['wrangler', 'secret', 'put', 'API_KEY'], {
		input: `${apiKey}\n`,
		timeout: 120000,
	});
	if (!result.ok) {
		console.log(result.stdout);
		console.log(result.stderr);
		fail('写入 API_KEY secret 失败');
	}
	logSuccess('API_KEY secret 写入成功');
}

function buildDeployArgs(options: DeployOptions): string[] {
	const args = ['wrangler', 'deploy'];
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
	let finalConfig = resolveEnvConfig(baseConfig, envName);

	const envVarsFromFiles: Record<string, string> = {};
	for (const file of options.envFile || []) {
		Object.assign(envVarsFromFiles, parseEnvFile(file));
	}

	if (!finalConfig.vars || typeof finalConfig.vars !== 'object' || Array.isArray(finalConfig.vars)) {
		finalConfig.vars = {};
	}
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

	const deployArgs = buildDeployArgs(options);
	const previewCommand = `${getNpxBin()} ${deployArgs.join(' ')}`;

	if (options.dryRun) {
		console.log(chalk.cyan('\n[DRY-RUN] 配置预览 (不会写入文件，不会部署)'));
		console.log(`环境: ${envName}`);
		console.log(`计划生成: ${generatedPathRelative}`);
		console.log('\n--- wrangler.jsonc ---');
		console.log(toJsonc(finalConfig).trim());
		console.log('--- end ---\n');
		logSuccess('配置校验通过');
		return;
	}

	const writtenFiles = ensureDeployFiles(envName, finalConfig);
	logSuccess(`已生成部署配置: ${path.relative(WORKDIR, writtenFiles.generatedPath)}`);
	logSuccess(`已生成配置重定向: ${path.relative(WORKDIR, writtenFiles.redirectPath)}`);

	if (options.plan) {
		console.log(chalk.cyan('\n[PLAN] 部署计划'));
		console.log(`环境: ${envName}`);
		console.log(`配置: ${generatedPathRelative}`);
		console.log(`重定向: ${path.relative(WORKDIR, redirectPath)}`);
		console.log(`命令: ${previewCommand}`);
		return;
	}

	const apiKey = options.apiKey || process.env.API_KEY;
	if (!options.nonInteractive && !apiKey) {
		const answer = await inquirer.prompt([
			{
				type: 'confirm',
				name: 'setSecret',
				message: '未检测到 API_KEY，是否跳过 API_KEY secret 写入?',
				default: true,
			},
		]);
		if (!answer.setSecret) {
			fail('请通过 --api-key 或环境变量 API_KEY 提供密钥');
		}
	}

	runBuild(Boolean(options.skipBuild));
	upsertApiKeySecret(apiKey);

	logInfo(`执行部署命令: ${previewCommand}`);
	const deployResult = run(getNpxBin(), deployArgs, { timeout: 300000 });
	if (!deployResult.ok) {
		console.log(deployResult.stdout);
		console.log(deployResult.stderr);
		fail('部署失败');
	}

	console.log(deployResult.stdout.trim());
	logSuccess(options.dryRun ? 'dry-run 执行成功' : '部署成功');
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
	let finalConfig = resolveEnvConfig(baseConfig, envName);
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
	.option('--plan', '只输出执行计划，不执行部署')
	.option('--dry-run', '执行 wrangler deploy --dry-run')
	.option('--conf-file <path>', '覆盖生成配置的 wrangler.jsonc/json/toml 文件')
	.option('--var <keyValue>', '追加变量，格式 KEY:VALUE', (value: string, previous: string[] = []) => [...previous, value], [])
	.option('--env-file <path>', '加载环境变量文件，格式 KEY=VALUE', (value: string, previous: string[] = []) => [...previous, value], [])
	.option('--keep-vars', '部署时启用 --keep-vars')
	.option('--non-interactive', '禁用交互模式')
	.option('--yes', '使用推荐默认值')
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
	.option('--conf-file <path>', '覆盖生成配置的 wrangler.jsonc/json/toml 文件')
	.option('--non-interactive', '禁用交互模式')
	.action(async (options: DeployOptions) => {
		await printConfig(options);
	});

program.parse();
