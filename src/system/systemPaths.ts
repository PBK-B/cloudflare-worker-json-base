export const SYSTEM_PATH_PREFIX = '/._system'
export const PERMISSION_RULES_ROOT = `${SYSTEM_PATH_PREFIX}/permissions`
export const PERMISSION_RULES_INDEX_PATH = `${PERMISSION_RULES_ROOT}/index.json`
export const PERMISSION_RULES_RECORDS_ROOT = `${PERMISSION_RULES_ROOT}/rules`
export const PATH_MAPPINGS_ROOT = `${SYSTEM_PATH_PREFIX}/path-mappings`
export const PATH_MAPPINGS_INDEX_PATH = `${PATH_MAPPINGS_ROOT}/index.json`
export const PATH_MAPPINGS_RECORDS_ROOT = `${PATH_MAPPINGS_ROOT}/records`

export function getPermissionRuleRecordPath(id: string): string {
  return `${PERMISSION_RULES_RECORDS_ROOT}/${id}.json`
}

export function getPathMappingRecordPath(encodedPath: string): string {
  return `${PATH_MAPPINGS_RECORDS_ROOT}/${encodedPath}.json`
}

export function isSystemPath(pathname: string): boolean {
  return pathname === SYSTEM_PATH_PREFIX || pathname.startsWith(`${SYSTEM_PATH_PREFIX}/`)
}
