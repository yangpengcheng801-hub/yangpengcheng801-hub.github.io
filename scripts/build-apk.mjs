import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const androidDir = join(root, 'android')

const jbrCandidates = [
  'D:\\APP\\anzuo\\jbr',
  join(process.env.ProgramFiles || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr'),
  join(
    process.env.LOCALAPPDATA || '',
    'Programs',
    'Android',
    'Android Studio',
    'jbr',
  ),
]

const env = { ...process.env }
for (const jbr of jbrCandidates) {
  if (existsSync(join(jbr, 'bin', 'java.exe'))) {
    env.JAVA_HOME = jbr
    break
  }
}

const sdk =
  process.env.ANDROID_HOME ||
  join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk')
if (sdk) env.ANDROID_HOME = sdk

const gradlew = join(androidDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
const r = spawnSync(gradlew, ['assembleDebug'], {
  cwd: androidDir,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (r.status !== 0) process.exit(r.status ?? 1)

const apk = join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
console.log(`\nAPK 已生成: ${apk}\n`)
