export const SYSTEM_PATH_PREFIX = '/._system'
export const PERMISSION_RULES_ROOT = `${SYSTEM_PATH_PREFIX}/permissions`
export const PERMISSION_RULES_INDEX_PATH = `${PERMISSION_RULES_ROOT}/index.json`
export const PERMISSION_RULES_RECORDS_ROOT = `${PERMISSION_RULES_ROOT}/rules`

export function getPermissionRuleRecordPath(id: string): string {
  return `${PERMISSION_RULES_RECORDS_ROOT}/${id}.json`
}

export function isSystemPath(pathname: string): boolean {
  return pathname === SYSTEM_PATH_PREFIX || pathname.startsWith(`${SYSTEM_PATH_PREFIX}/`)
}
