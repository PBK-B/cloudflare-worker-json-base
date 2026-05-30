import type { HealthDto } from '@jsonbase/shared';
import type { AppContainer } from '../../../bootstrap/createContainer';

export function getHealth(container: AppContainer): HealthDto {
	return {
		status: 'healthy',
		version: container.config.version,
		timestamp: new Date().toISOString(),
		environment: container.config.environment
	};
}
