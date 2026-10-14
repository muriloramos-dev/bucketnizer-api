import { sleep } from 'k6';
import { uploadAndRead, requireReadableFixture, baseOptions, testPath } from './common.js';

export const options = {
	...baseOptions,
	scenarios: {
		people_uploading_and_opening_photos: {
			executor: 'ramping-vus',
			startVUs: Number(__ENV.K6_START_VUS || 1),
			stages: [
				{ duration: __ENV.K6_RAMP_UP || '2m', target: Number(__ENV.K6_PEAK_VUS || 10) },
				{ duration: __ENV.K6_HOLD || '5m', target: Number(__ENV.K6_PEAK_VUS || 10) },
				{ duration: __ENV.K6_RAMP_DOWN || '1m', target: 0 },
			],
			gracefulRampDown: '2m',
		},
	},
	thresholds: {
		...baseOptions.thresholds,
		'http_req_duration{name:api_upload_ticket}': ['p(95)<1500'],
		'http_req_duration{name:api_get_original_url}': ['p(95)<1500'],
		upload_to_ready_ms: ['p(95)<120000'],
	},
};

export function setup() {
	requireReadableFixture();
	console.log(`Fluxo de upload grava arquivos em /${testPath}; cada iteração deixa um arquivo de teste na conta e no S3.`);
}

export default function () {
	uploadAndRead();
	sleep(Number(__ENV.K6_THINK_TIME_SECONDS || 1));
}
