// 逐个子进程运行 tests/*.test.js，任一失败则退出码非 0
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const dir = __dirname
const files = fs.readdirSync(dir).filter(name => name.endsWith('.test.js')).sort()
let failed = 0
files.forEach(name => {
  const result = spawnSync(process.execPath, [path.join(dir, name)], { stdio: 'inherit' })
  if (result.status !== 0) {
    failed += 1
    console.error(`FAILED: ${name}`)
  }
})
console.log(`\n${files.length - failed}/${files.length} test files passed`)
process.exit(failed ? 1 : 0)
