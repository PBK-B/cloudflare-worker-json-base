import { getConsoleConfig } from '../../modules/console/application/getConsoleConfig';
import { getConsoleInfo } from '../../modules/console/application/getConsoleInfo';
import { getConsoleStats } from '../../modules/console/application/getConsoleStats';
import { jsonPresenter } from '../presenters/jsonPresenter';
import type { RequestContext } from '../../bootstrap/createRequestContext';

export function consoleController(context: RequestContext): Response {
	return jsonPresenter({ success: true, data: getConsoleInfo(context.container), timestamp: new Date().toISOString() });
}

export async function consoleStatsController(context: RequestContext): Promise<Response> {
	return jsonPresenter({ success: true, data: await getConsoleStats(context.container), timestamp: new Date().toISOString() });
}

export function consoleConfigController(context: RequestContext): Response {
	return jsonPresenter({ success: true, data: getConsoleConfig(context.container), timestamp: new Date().toISOString() });
}
