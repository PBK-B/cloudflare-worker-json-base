import { getHealth } from '../../modules/console/application/getHealth';
import { jsonPresenter } from '../presenters/jsonPresenter';
import type { RequestContext } from '../../bootstrap/createRequestContext';
import { maybeAuth } from '../middleware/auth';

export function healthController(context: RequestContext): Response {
	const auth = maybeAuth(context);
	const health = getHealth(context.container);

	return jsonPresenter({
		success: true,
		data: {
			...health,
			apiKey: auth ? { valid: true, method: auth.method } : { valid: false }
		},
		timestamp: new Date().toISOString()
	});
}
