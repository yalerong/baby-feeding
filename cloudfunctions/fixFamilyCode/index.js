// 历史一次性修数入口已停用，避免误调用后跨家庭重写记录。
exports.main = async () => {
  return { success: false, error: 'MAINTENANCE_DISABLED' }
}
