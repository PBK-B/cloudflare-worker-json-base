# AI Architecture Guide - JSON Base v2.0.0

This document helps AI agents and large language models understand the project structure, conventions, and development patterns.

---

## Project Overview

**JSON Base** is a Cloudflare Workers-based JSON and file storage service using D1 database and KV storage.

- **Language**: TypeScript
- **Platform**: Cloudflare Workers
- **Storage**: D1 (metadata) + KV (file blobs)
- **Version**: v2.0.0

---

## Directory Structure

```
data/users/bin/cloudflare-worker-json-base/
├── src/
│   ├── index.ts              # Worker entry point
│   ├── api/
│   │   ├── router.ts         # Request routing
│   │   └── resourceController.ts  # Resource CRUD operations
│   ├── storage/
│   │   ├── storageAdapter.ts # Unified storage interface
│   │   ├── d1MetadataManager.ts  # D1 metadata operations
│   │   └── fileStorageService.ts # KV file operations
│   ├── utils/
│   │   ├── middleware.ts     # Auth, logging, error handling
│   │   ├── resourceValidator.ts  # Input validation
│   │   └── pathMapper.ts     # Path mapping utilities
│   └── __tests__/            # Test files
├── scripts/
│   └── test-api.sh           # Integration test script
├── docs/
├── wrangler.toml             # Cloudflare configuration
├── package.json
└── jest.worker.config.json   # Test configuration
```

---

## Request Processing Flow

```
1. HTTP Request → index.ts (fetch handler)
2. Extract path, method, headers
3. router.ts → Validate path structure
4. middleware.ts → Authentication check (requireAuth)
5. resourceController.ts → Route to appropriate handler
6. storageAdapter.ts → Abstract storage operations
7. D1/KV → Data persistence
8. Response → JSON/Text/File download
```

---

## Key Components

### 1. Router (`src/api/router.ts`)

**Responsibility**: Request routing and path validation

**Key Functions**:
- `handleRequest()` - Main entry point
- `validateResourcePath()` - Security validation

**Flow**:
```typescript
Request → validate path → requireAuth → route to controller
```

### 2. ResourceController (`src/api/resourceController.ts`)

**Responsibility**: CRUD operations for resources

**Methods**:
- `handleGet(path)` - Retrieve resource
- `handlePost(path, data)` - Create resource
- `handlePut(path, data)` - Update resource (full replace)
- `handleDelete(path)` - Delete resource

**Response Types**:
- JSON: `{ success: true, data: ... }`
- Text: Raw string
- File: Binary download with proper Content-Type

### 3. StorageAdapter (`src/storage/storageAdapter.ts`)

**Responsibility**: Unified interface to D1 and KV storage

**Key Methods**:
- `get(path)` - Fetch resource (JSON/Text/File)
- `create(path, data, type)` - Create new resource
- `update(path, data, type)` - Update existing resource
- `delete(path)` - Remove resource and path mapping

**Features**:
- Automatic Content-Type detection
- Binary data handling (Uint8Array)
- File size limits (10MB)

### 4. Middleware (`src/utils/middleware.ts`)

**Responsibility**: Cross-cutting concerns

**Functions**:
- `requireAuth()` - Validate API key header
- `errorResponse()` - Standardized error format
- `jsonResponse()` - JSON response helper

---

## Code Conventions

### Error Handling

Use `StorageError` class for storage-related errors:

```typescript
throw new StorageError(404, 'Resource not found', 'NOT_FOUND');
```

Response format:
```typescript
{
  success: false,
  error: {
    code: string,
    message: string
  }
}
```

### File Naming

- **CamelCase**: `resourceController.ts`, `fileStorageService.ts`
- **Test files**: `*.test.ts` in `__tests__/` folder
- **Config files**: `*.config.json`, `wrangler.toml`

### Type Definitions

Define interfaces for request/response structures:

```typescript
interface ResourceResponse {
  success: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
}
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DB` | D1 database binding |
| `FILES` | KV namespace for file storage |
| `API_KEY` | Authentication key |

---

## Development Patterns

### 1. Parameterized Queries (D1)

**Always** use parameterized statements:

```typescript
// ✅ CORRECT
const stmt = env.DB.prepare(
  'SELECT * FROM path_mapper WHERE resource_path = ?1'
);
stmt.bind(path);

// ❌ WRONG - Never concatenate strings
const badQuery = `SELECT * FROM path_mapper WHERE resource_path = '${path}'`;
```

### 2. Path Validation

**Always** validate paths before processing:

```typescript
const pathError = validateResourcePath(path);
if (pathError) {
  return errorResponse(400, pathError);
}
```

Reject paths containing:
- `..` (path traversal)
- Leading/trailing slashes (normalize first)

### 3. Content-Type Handling

For file responses:

```typescript
if (data instanceof Uint8Array) {
  return new Response(data, {
    headers: { 'Content-Type': contentType }
  });
}
```

### 4. Testing

**Test locations**:
- Unit tests: `src/__tests__/*.test.ts`
- Integration: `scripts/test-api.sh`

**Test patterns**:
```typescript
describe('ResourceController', () => {
  it('should create JSON resource', async () => {
    const controller = new ResourceController(env);
    const response = await controller.handlePost('/test', { key: 'value' });
    expect(response.status).toBe(201);
  });
});
```

---

## Common Patterns

### Creating a Resource

```typescript
// Client
POST /my-data
x-api-key: YOUR_KEY
Content-Type: application/json

{ "name": "test", "value": 123 }

// Server flow
requireAuth → resourceController.handlePost → storageAdapter.create → D1 + KV
```

### Updating a Resource

```typescript
// Client
PUT /my-data
x-api-key: YOUR_KEY
Content-Type: application/json

{ "name": "updated", "value": 456 }

// Server flow
requireAuth → resourceController.handlePut → storageAdapter.update → delete old → create new
```

### Downloadingtypescript
// Client a File

```
GET /files/image.png
x-api-key: YOUR_KEY

// Server response
200 OK
Content-Type: image/png
Content-Disposition: attachment; filename="image.png"
```

---

## Important Implementation Details

### 1. PathMapper Deletion Order

When updating a resource, **must** delete pathMapper entry BEFORE deleting the file:

```typescript
// storageAdapter.update()
await this.pathMapper.delete(path);  // First!
await this.fileStorage.delete(path); // Second!
await this.create(path, data, type); // Then recreate
```

This prevents 401 errors during PUT operations.

### 2. Binary Data Handling

Store binary data as `Uint8Array`:

```typescript
const fileData = new Uint8Array(await arrayBuffer);
```

When returning files:

```typescript
if (result.type === 'file') {
  return new Response(result.data as Uint8Array, {
    headers: { 'Content-Type': result.contentType }
  });
}
```

### 3. File Size Limits

Maximum file size: 10MB (defined as `MAX_FILE_SIZE`)

```typescript
if (fileData.length > MAX_FILE_SIZE) {
  throw new StorageError(413, 'File too large');
}
```

---

## Testing Commands

```bash
# Run unit tests
npm run test:worker

# Run integration tests
./scripts/test-api.sh -k YOUR_API_KEY

# Local development
npm run dev

# Deploy to Cloudflare
npx wrangler deploy
```

---

## Security Checklist

Before committing code:

- [ ] No SQL injection (use parameterized queries)
- [ ] Path validation in router
- [ ] Authentication middleware on protected routes
- [ ] Input sanitization on user data
- [ ] Error messages don't leak internal details
- [ ] File uploads have size limits
- [ ] Tests pass (`npm run test:worker`)

---

## Known Issues & Workarounds

| Issue | Status | Workaround |
|-------|--------|------------|
| PUT returns 401 | Fixed | Delete pathMapper before file in update() |
| Binary Content-Type | Fixed | Preserve original Content-Type in create() |

---

## Getting Help

- **Codebase**: Search for similar patterns in `src/`
- **Tests**: Check `src/__tests__/` for usage examples
- **Cloudflare Docs**: https://developers.cloudflare.com/workers/

---

**Last Updated**: January 25, 2025
