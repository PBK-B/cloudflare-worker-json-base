import { joinRoute } from '@jsonbase/shared';
import type { ConsoleInfoDto } from '@jsonbase/shared';
import type { AppContainer } from '../../../bootstrap/createContainer';

export function getConsoleInfo(container: AppContainer): ConsoleInfoDto {
	return {
		name: 'JSON Base Console',
		version: container.config.version,
		endpoints: {
			console: joinRoute(container.config.apiBasePath, 'admin/console'),
			stats: joinRoute(container.config.apiBasePath, 'admin/console/stats'),
			config: joinRoute(container.config.apiBasePath, 'admin/console/config'),
			health: joinRoute(container.config.apiBasePath, 'health')
		},
		features: [
			'JSON resource CRUD',
			'Text resource CRUD',
			'Binary resource CRUD',
			'Permission management',
			'Console monitoring'
		],
		timestamp: new Date().toISOString()
	};
}
