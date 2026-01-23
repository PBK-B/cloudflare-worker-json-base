import { Command } from 'commander'
import inquirer from 'inquirer'
import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import { execSync, spawn } from 'child_process'

const program = new Command()

const log = {
  info: (msg: string) => console.log(chalk.blue('[INFO]'), msg),
  success: (msg: string) => console.log(chalk.green('[SUCCESS]'), msg),
  warning: (msg: string) => console.log(chalk.yellow('[WARNING]'), msg),
  error: (msg: string) => console.log(chalk.red('[ERROR]'), msg)
}

function checkCommand(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function executeCommand(command: string, description: string): Promise<boolean> {
  return new Promise((resolve) => {
    log.info(description)
    log.info(`执行: ${command}`)
    
    const child = spawn(command, { shell: true, stdio: 'inherit' })
    
    child.on('close', (code) => {
      if (code === 0) {
        log.success(`${description} 完成`)
        resolve(true)
      } else {
        log.error(`${description} 失败`)
        resolve(false)
      }
    })
    
    child.on('error', (error) => {
      log.error(`命令执行错误: ${error.message}`)
      resolve(false)
    })
  })
}

async function checkPrerequisites() {
  log.info('检查系统环境...')
  
  const requirements = ['node', 'npm', 'npx']
  const missing = requirements.filter(cmd => !checkCommand(cmd))
  
  if (missing.length > 0) {
    log.error(`缺少必要工具: ${missing.join(', ')}`)
    process.exit(1)
  }
  
  if (!checkCommand('wrangler')) {
    log.info('安装 wrangler CLI...')
    const success = await executeCommand('npm install -g wrangler', '安装 wrangler')
    if (!success) {
      process.exit(1)
    }
  }
  
  log.success('系统环境检查完成')
}

async function getUserConfig() {
  log.info('配置项目参数...')
  
  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: '请输入 API Key:',
      validate: (input: string) => input.trim() !== '' || 'API Key 不能为空'
    },
    {
      type: 'input',
      name: 'workerName',
      message: 'Worker 名称:',
      default: 'worker-json-base'
    },
    {
      type: 'input',
      name: 'kvNamespace',
      message: 'KV 命名空间:',
      default: 'JSONBIN'
    },
    {
      type: 'list',
      name: 'environment',
      message: '部署环境:',
      choices: ['development', 'production'],
      default: 'development'
    }
  ])
  
  return answers
}

function updateConfigFiles(config: any) {
  log.info('更新配置文件...')
  
  const indexPath = path.join(process.cwd(), 'src/index.ts')
  if (fs.existsSync(indexPath)) {
    let indexContent = fs.readFileSync(indexPath, 'utf8')
    indexContent = indexContent.replace(
      /let APIKEY = '[^']*';/,
      `let APIKEY = '${config.apiKey}';`
    )
    fs.writeFileSync(indexPath, indexContent)
    log.success('更新 src/index.ts')
  }
  
  const wranglerPath = path.join(process.cwd(), 'wrangler.toml')
  const wranglerContent = `#:schema node_modules/wrangler/config-schema.json
name = "${config.workerName}"
main = "src/index.ts"
compatibility_date = "2024-05-02"

[[kv_namespaces]]
binding = "${config.kvNamespace}"
id = "${config.kvNamespace.toLowerCase()}"

[[kv_namespaces]]
binding = "${config.kvNamespace}"
id = "${config.kvNamespace.toLowerCase()}_preview"
preview_id = true
`
  fs.writeFileSync(wranglerPath, wranglerContent)
  log.success('更新 wrangler.toml')
}

async function cloudflareAuth() {
  log.info('Cloudflare 账户认证...')
  
  try {
    execSync('wrangler whoami', { stdio: 'ignore' })
    log.success('已登录 Cloudflare 账户')
  } catch {
    log.info('请登录您的 Cloudflare 账户...')
    const success = await executeCommand('wrangler login', 'Cloudflare 登录')
    if (!success) {
      throw new Error('Cloudflare 认证失败')
    }
  }
}

async function createKvNamespace(kvNamespace: string) {
  log.info(`创建 KV 命名空间: ${kvNamespace}`)
  
  try {
    const result = execSync('wrangler kv:namespace list', { encoding: 'utf8' })
    if (result.includes(kvNamespace)) {
      log.warning(`KV 命名空间 ${kvNamespace} 已存在`)
      return
    }
    
    await executeCommand(`wrangler kv:namespace create "${kvNamespace}"`, '创建生产 KV 命名空间')
    await executeCommand(`wrangler kv:namespace create "${kvNamespace}" --preview`, '创建预览 KV 命名空间')
    
  } catch (error) {
    log.error(`创建 KV 命名空间失败: ${error}`)
    throw error
  }
}

async function deployWorker() {
  log.info('部署 Worker...')
  
  const buildSuccess = await executeCommand('npm run webui:build', '构建 WebUI')
  if (!buildSuccess) {
    throw new Error('WebUI 构建失败')
  }
  
  const deploySuccess = await executeCommand('wrangler deploy', '部署 Worker')
  if (!deploySuccess) {
    throw new Error('Worker 部署失败')
  }
}

async function verifyDeployment(config: any) {
  log.info('验证部署...')
  
  try {
    const workerUrl = `https://${config.workerName}.workers.dev`
    
    const response = await fetch(`${workerUrl}/api/test`)
    if (response.ok) {
      log.success('API 测试通过')
    } else {
      log.warning('API 测试失败，请检查配置')
    }
    
    log.success(`Worker URL: ${workerUrl}`)
    log.success(`WebUI 控制台: ${workerUrl}`)
    
  } catch (error) {
    log.warning(`验证失败: ${error}`)
  }
}

async function deploy() {
  console.log(chalk.blue.bold('🚀 JSON Base 一键部署工具'))
  console.log(chalk.gray('='.repeat(50)))
  
  try {
    await checkPrerequisites()
    const config = await getUserConfig()
    updateConfigFiles(config)
    await cloudflareAuth()
    await createKvNamespace(config.kvNamespace)
    await deployWorker()
    await verifyDeployment(config)
    
    console.log()
    console.log(chalk.green.bold('🎉 部署完成！'))
    console.log(chalk.gray('='.repeat(50)))
    log.info('您可以访问以下地址：')
    log.info('- WebUI 控制台: 访问您的 Worker URL')
    log.info('- API 文档: 查看 WebUI 中的使用说明')
    
  } catch (error) {
    log.error(`部署失败: ${error}`)
    process.exit(1)
  }
}

async function check() {
  console.log(chalk.blue.bold('🔍 检查部署状态'))
  console.log(chalk.gray('='.repeat(50)))
  
  try {
    if (checkCommand('wrangler')) {
      try {
        execSync('wrangler whoami', { stdio: 'ignore' })
        log.success('Cloudflare 账户已登录')
      } catch {
        log.warning('Cloudflare 账户未登录')
      }
    } else {
      log.error('wrangler CLI 未安装')
    }
    
    if (fs.existsSync('package.json')) {
      if (fs.existsSync('node_modules')) {
        log.success('项目依赖已安装')
      } else {
        log.warning('项目依赖未安装')
      }
    } else {
      log.error('未找到 package.json')
    }
    
    const files = ['src/index.ts', 'wrangler.toml']
    files.forEach(file => {
      if (fs.existsSync(file)) {
        log.success(`${file} 存在`)
      } else {
        log.error(`${file} 不存在`)
      }
    })
    
  } catch (error) {
    log.error(`检查失败: ${error}`)
  }
}

program
  .name('deploy-cli')
  .description('JSON Base 一键部署工具')
  .version('1.0.0')

program
  .command('deploy')
  .description('执行一键部署')
  .action(deploy)

program
  .command('check')
  .description('检查部署状态')
  .action(check)

program.parse()