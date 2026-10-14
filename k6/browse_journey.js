import http from 'k6/http';
import { check, sleep } from 'k6';
import { authParams, apiUrl, baseOptions, testPath } from './common.js';

export const options = {
	...baseOptions,
	scenarios: {
		people_browsing_and_opening_photos: {
			executor: 'ramping-vus',
			startVUs: Number(__ENV.K6_START_VUS || 1),
			stages: [
				{ duration: __ENV.K6_RAMP_UP || '2m', target: Number(__ENV.K6_PEAK_VUS || 10) },
				{ duration: __ENV.K6_HOLD || '5m', target: Number(__ENV.K6_PEAK_VUS || 10) },
				{ duration: __ENV.K6_RAMP_DOWN || '1m', target: 0 },
			],
			gracefulRampDown: '30s',
		},
	},
	thresholds: {
		...baseOptions.thresholds,
		'http_req_duration{name:api_list_thumbnails}': ['p(95)<1500'],
		'http_req_duration{name:api_get_original_url}': ['p(95)<1500'],
	},
};

export function setup() {
	console.log(`Configure K6_PATH (atual: ${testPath}) para uma pasta existente com fotos READY em cada conta autenticada.`);
}

export default function () {
	const path = encodeURIComponent(__ENV.K6_PATH || testPath);
	const listResponse = http.get(apiUrl(`/files/thumbnails?path=${path}`), authParams('api_list_thumbnails'));
	if (!check(listResponse, {
		'thumbnail list returned 200': (response) => response.status === 200,
		'folder has at least one READY photo': (response) => {
			try { return Array.isArray(response.json()) && response.json().length > 0; } catch { return false; }
		},
	})) return;

	const photos = listResponse.json();
	const photo = photos[Math.floor(Math.random() * photos.length)];
	sleep(Number(__ENV.K6_THINK_TIME_SECONDS || 1));
	const thumbnailResponse = http.get(photo.thumbnailUrl, { tags: { name: 's3_download_thumbnail' } });
	if (!check(thumbnailResponse, { 'S3 thumbnail download succeeded': (response) => response.status === 200 })) return;
	sleep(Number(__ENV.K6_THINK_TIME_SECONDS || 1));
	const objectResponse = http.get(
		apiUrl(`/files/${encodeURIComponent(photo.objectId)}`),
		authParams('api_get_original_url'),
	);
	if (!check(objectResponse, {
		'original URL request returned 200': (response) => response.status === 200,
		'original URL is present': (response) => {
			try { return Boolean(response.json().url); } catch { return false; }
		},
	})) return;

	const download = http.get(objectResponse.json().url, { tags: { name: 's3_download_original' } });
	check(download, { 'S3 original download succeeded': (response) => response.status === 200 });
	sleep(Number(__ENV.K6_THINK_TIME_SECONDS || 1));
}
