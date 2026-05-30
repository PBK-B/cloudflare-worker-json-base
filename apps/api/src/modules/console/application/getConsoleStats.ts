import type { ConsoleStatsDto } from '@jsonbase/shared';
import type { AppContainer } from '../../../bootstrap/createContainer';

export async function getConsoleStats(container: AppContainer): Promise<ConsoleStatsDto> {
	const stats = await container.resourceService.stats();
	return {
		totalCount: stats.totalCount,
		totalSize: stats.totalSize,
		pageCount: Math.ceil(stats.totalCount / 20),
		storageBackend: container.config.storageBackend,
		environment: container.config.environment,
		version: container.config.version
	};
}
