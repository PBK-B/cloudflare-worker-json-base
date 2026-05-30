import type { ConsoleConfigDto } from '@jsonbase/shared';
import type { AppContainer } from '../../../bootstrap/createContainer';

export function getConsoleConfig(container: AppContainer): ConsoleConfigDto {
	return {
		environment: container.config.environment,
		version: container.config.version,
		storageBackend: container.config.storageBackend,
		webBasePath: container.config.webBasePath,
		apiBasePath: container.config.apiBasePath
	};
}
