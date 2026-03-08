import { PermissionAction, PermissionMode } from '../types'

export interface AccessModeResult {
  read: 'public' | 'private'
  write: 'public' | 'private'
}

export function normalizePermissionPath(pathname: string): string {
  if (!pathname) {
    return '/'
  }

  let normalized = pathname.trim()
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`
  }

  normalized = normalized.replace(/\/+/g, '/')
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.replace(/\/+$/, '')
  }

  return normalized || '/'
}

export function permissionModeToAccess(mode: PermissionMode): AccessModeResult {
  switch (mode) {
    case 'public_rw':
      return { read: 'public', write: 'public' }
    case 'private_read_public_write':
      return { read: 'private', write: 'public' }
    case 'public_read_private_write':
      return { read: 'public', write: 'private' }
    case 'private_rw':
    default:
      return { read: 'private', write: 'private' }
  }
}

export function isActionPublic(mode: PermissionMode, action: PermissionAction): boolean {
  const access = permissionModeToAccess(mode)
  return access[action] === 'public'
}

export function matchPermissionPattern(pattern: string, pathname: string): boolean {
  const normalizedPattern = normalizePermissionPath(pattern)
  const normalizedPath = normalizePermissionPath(pathname)

  if (normalizedPattern === normalizedPath) {
    return true
  }

  const patternSegments = toSegments(normalizedPattern)
  const pathSegments = toSegments(normalizedPath)
  return matchSegments(patternSegments, pathSegments)
}

function toSegments(value: string): string[] {
  if (value === '/') {
    return []
  }

  return value.replace(/^\//, '').split('/').filter(Boolean)
}

function matchSegments(patternSegments: string[], pathSegments: string[]): boolean {
  return matchFromIndex(patternSegments, pathSegments, 0, 0)
}

function matchFromIndex(patternSegments: string[], pathSegments: string[], patternIndex: number, pathIndex: number): boolean {
  if (patternIndex === patternSegments.length) {
    return pathIndex === pathSegments.length
  }

  const segment = patternSegments[patternIndex]

  if (segment === '**') {
    if (patternIndex === patternSegments.length - 1) {
      return true
    }

    for (let nextPathIndex = pathIndex; nextPathIndex <= pathSegments.length; nextPathIndex += 1) {
      if (matchFromIndex(patternSegments, pathSegments, patternIndex + 1, nextPathIndex)) {
        return true
      }
    }

    return false
  }

  if (pathIndex >= pathSegments.length) {
    return false
  }

  if (!matchSegmentToken(segment, pathSegments[pathIndex])) {
    return false
  }

  return matchFromIndex(patternSegments, pathSegments, patternIndex + 1, pathIndex + 1)
}

function matchSegmentToken(patternSegment: string, pathSegment: string): boolean {
  if (patternSegment === '*') {
    return true
  }

  const regex = segmentPatternToRegex(patternSegment)
  return regex.test(pathSegment)
}

function segmentPatternToRegex(patternSegment: string): RegExp {
  let result = '^'

  for (let index = 0; index < patternSegment.length; index += 1) {
    const char = patternSegment[index]

    if (char === '*') {
      result += '[^/]*'
      continue
    }

    if (char === '?') {
      result += '[^/]'
      continue
    }

    if (char === '[') {
      const closingIndex = patternSegment.indexOf(']', index + 1)
      if (closingIndex > index + 1) {
        const rawClass = patternSegment.slice(index + 1, closingIndex)
        const sanitizedClass = rawClass.replace(/\\/g, '\\\\')
        if (sanitizedClass.startsWith('!')) {
          result += `[^${sanitizedClass.slice(1)}]`
        } else {
          result += `[${sanitizedClass}]`
        }
        index = closingIndex
        continue
      }
    }

    result += escapeRegexCharacter(char)
  }

  result += '$'
  return new RegExp(result)
}

function escapeRegexCharacter(char: string): string {
  return /[|\\{}()[\]^$+?.]/.test(char) ? `\\${char}` : char
}
