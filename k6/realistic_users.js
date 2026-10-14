import http from 'k6/http';
import { check, sleep } from 'k6';
import { authParams, apiUrl, baseOptions, testPath, uploadFixture, uploadContentType, uploadFilename } from './common.js';

// State is local to each VU: uploaded objects stay pending until a later random status check.
const pendingUploads = [];

export const options = {
	...baseOptions,
	scenarios: {
		realistic_users: {
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
		'http_req_duration{name:api_list_folders}': ['p(95)<1500'],
		'http_req_duration{name:api_list_thumbnails}': ['p(95)<1500'],
		'http_req_duration{name:api_upload_ticket}': ['p(95)<1500'],
	},
};

function think() {
	// Human pause between actions, uniformly sampled from 3 to 8 seconds.
	sleep(3 + Math.random() * 5);
}

function listFolders() {
	const response = http.get(apiUrl('/files/folders'), authParams('api_list_folders'));
	check(response, { 'folder listing returned 200': (r) => r.status === 200 });
}

function getPhotos() {
	const path = encodeURIComponent(testPath);
	const response = http.get(apiUrl(`/files/thumbnails?path=${path}`), authParams('api_list_thumbnails'));
	if (!check(response, { 'thumbnail listing returned 200': (r) => r.status === 200 })) return [];
	try {
		const photos = response.json();
		return Array.isArray(photos) ? photos : [];
	} catch {
		check(false, { 'thumbnail response is valid JSON': Boolean });
		return [];
	}
}

function browseFolder() {
	const photos = getPhotos();
	if (photos.length === 0) return;
	const photo = photos[Math.floor(Math.random() * photos.length)];
	const thumbnail = http.get(photo.thumbnailUrl, { tags: { name: 's3_download_thumbnail' } });
	check(thumbnail, { 'S3 thumbnail download succeeded': (r) => r.status === 200 });
}

function openPhoto() {
	const photos = getPhotos();
	if (photos.length === 0) return;
	const photo = photos[Math.floor(Math.random() * photos.length)];
	const thumbnail = http.get(photo.thumbnailUrl, { tags: { name: 's3_download_thumbnail' } });
	if (!check(thumbnail, { 'S3 thumbnail download succeeded': (r) => r.status === 200 })) return;
	think();
	const urlResponse = http.get(
		apiUrl(`/files/${encodeURIComponent(photo.objectId)}`),
		authParams('api_get_original_url'),
	);
	if (!check(urlResponse, {
		'original URL request returned 200': (r) => r.status === 200,
		'original URL is present': (r) => {
			try { return Boolean(r.json().url); } catch { return false; }
		},
	})) return;
	const download = http.get(urlResponse.json().url, { tags: { name: 's3_download_original' } });
	check(download, { 'S3 original download succeeded': (r) => r.status === 200 });
}

function uploadPhoto() {
	const metadata = {
		originalName: uploadFilename,
		contentType: uploadContentType,
		size: uploadFixture.byteLength,
		importId: `k6-${__VU}-${__ITER}-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
	};
	const ticketResponse = http.post(
		apiUrl('/files/upload'),
		JSON.stringify({ path: testPath, file: metadata }),
		authParams('api_upload_ticket', { headers: { 'Content-Type': 'application/json' } }),
	);
	if (!check(ticketResponse, {
		'upload ticket returned 201': (r) => r.status === 201,
		'upload ticket contains objectId and URL': (r) => {
			try { const body = r.json(); return Boolean(body.objectId && body.url); } catch { return false; }
		},
	})) return;

	const ticket = ticketResponse.json();
	const put = http.put(ticket.url, uploadFixture, {
		headers: { 'Content-Type': uploadContentType },
		tags: { name: 's3_upload_original' },
	});
	if (check(put, { 'S3 upload succeeded': (r) => r.status >= 200 && r.status < 300 })) {
		pendingUploads.push(ticket.objectId);
	}
}

function checkOneUpload() {
	if (pendingUploads.length === 0) return;
	const index = Math.floor(Math.random() * pendingUploads.length);
	const objectId = pendingUploads[index];
	const response = http.get(
		apiUrl(`/files/${encodeURIComponent(objectId)}/status`),
		authParams('api_file_status'),
	);
	if (!check(response, { 'upload status returned 200': (r) => r.status === 200 })) return;
	try {
		const status = response.json().status;
		if (status === 'READY' || status === 'FAILED') pendingUploads.splice(index, 1);
	} catch {
		check(false, { 'upload status is valid JSON': Boolean });
	}
}

export function setup() {
	if (!uploadFixture || uploadFixture.byteLength === 0) throw new Error('K6_UPLOAD_FILE está vazio ou não pôde ser lido.');
	console.log(`Usuários virtuais usarão a pasta /${testPath}; decisões aleatórias: listar pastas 10%, navegar 32%, abrir foto 25%, enviar 20%, consultar upload 13%.`);
}

export default function () {
	const choice = Math.random();
	if (choice < 0.10) listFolders();
	else if (choice < 0.42) browseFolder();
	else if (choice < 0.67) openPhoto();
	else if (choice < 0.87) uploadPhoto();
	else checkOneUpload();
	think();
}
