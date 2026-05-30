import { createRuntimeConfig, type WorkerEnv } from '../infrastructure/config/runtimeConfig';
import { logger } from '../infrastructure/logging/logger';
import { D1PermissionRuleRepository } from '../modules/permission/infrastructure/d1PermissionRuleRepository';
import { PermissionService } from '../modules/permission/application/permissionService';
import { D1ResourceMetadataRepository } from '../modules/resource/infrastructure/d1ResourceMetadataRepository';
import { KvResourceContentStore } from '../modules/resource/infrastructure/kvResourceContentStore';
import { ResourceService } from '../modules/resource/application/resourceService';

export interface AppContainer {
	env: WorkerEnv;
	config: ReturnType<typeof createRuntimeConfig>;
	logger: typeof logger;
	resourceService: ResourceService;
	permissionService: PermissionService;
}

export function createContainer(env: WorkerEnv): AppContainer {
	const resourceMetadataRepository = new D1ResourceMetadataRepository(env.JSONBASE_DB);
	const resourceContentStore = new KvResourceContentStore(env.JSONBIN);
	const resourceService = new ResourceService(resourceMetadataRepository, resourceContentStore);
	const permissionRuleRepository = new D1PermissionRuleRepository(env.JSONBASE_DB);
	const permissionService = new PermissionService(permissionRuleRepository);

	return {
		env,
		config: createRuntimeConfig(env),
		logger,
		resourceService,
		permissionService
	};
}
