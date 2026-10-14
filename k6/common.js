import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const uploadToReadyMs = new Trend('upload_to_ready_ms');

const rawTokens = __ENV.K6_TOKENS_JSON;
const tokenList = rawTokens ? JSON.parse(rawTokens) : [__ENV.K6_TOKEN || ''];
const baseUrl = (__ENV.K6_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const runId = (__ENV.K6_RUN_ID || 'load-test').replace(/[^a-zA-Z0-9-]/g, '-');

if (!Array.isArray(tokenList) || tokenList.length === 0 || tokenList.some((token) => typeof token !== 'string' || !token)) {
	throw new Error('Defina K6_TOKEN ou K6_TOKENS_JSON com Cognito access tokens válidos.');
}

// k6 resolves open() paths relative to this module, so this works from either the repo root or k6/.
export const uploadFixture = open(__ENV.K6_UPLOAD_FILE || './fixtures/sample.svg', 'b');
export const uploadContentType = __ENV.K6_UPLOAD_CONTENT_TYPE || 'image/svg+xml';
export const uploadFilename = __ENV.K6_UPLOAD_FILENAME || 'k6-sample.svg';
export const testPath = __ENV.K6_PATH || `k6-${runId}`;
export const baseOptions = {
	thresholds: {
		http_req_failed: ['rate<0.05'],
		checks: ['rate>0.95'],
	},
};

export function authParams(name, extra = {}) {
	const token = tokenList[(__VU - 1) % tokenList.length];
	return {
		...extra,
		headers: {
			...(extra.headers || {}),
			Authorization: `Bearer ${token}`,
		},
		tags: { ...(extra.tags || {}), name },
	};
}

export function apiUrl(path) {
	return `${baseUrl}${path}`;
}

export function uploadAndRead() {
	const uploadStartedAt = Date.now();
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
	const ticketOk = check(ticketResponse, {
		'ticket status 201': (response) => response.status === 201,
		'ticket has objectId and signed URL': (response) => {
			try {
				const body = response.json();
				return Boolean(body.objectId && body.url);
			} catch {
				return false;
			}
		},
	});
	if (!ticketOk) return;

	const ticket = ticketResponse.json();
	const putResponse = http.put(ticket.url, uploadFixture, {
		headers: { 'Content-Type': uploadContentType },
		tags: { name: 's3_upload_original' },
	});
	if (!check(putResponse, { 'S3 PUT succeeded': (response) => response.status >= 200 && response.status < 300 })) return;

	const deadline = Date.now() + Number(__ENV.K6_READY_TIMEOUT_MS || 120000);
	let isReady = false;
	while (Date.now() < deadline) {
		const statusResponse = http.get(
			apiUrl(`/files/${encodeURIComponent(ticket.objectId)}/status`),
			authParams('api_file_status'),
		);
		if (statusResponse.status === 200) {
			const body = statusResponse.json();
			if (body.status === 'READY' && body.ready) {
				isReady = true;
				break;
			}
			if (body.status === 'FAILED') {
				check(body, { 'background processing reached READY': () => false });
				return;
			}
		} else if (statusResponse.status >= 500) {
			check(statusResponse, { 'status polling returned 200': (response) => response.status === 200 });
			return;
		}
		sleep(Number(__ENV.K6_POLL_INTERVAL_SECONDS || 2));
	}
	if (!isReady) {
		check(isReady, { 'background processing reached READY before timeout': Boolean });
		return;
	}
	uploadToReadyMs.add(Date.now() - uploadStartedAt);

	const downloadUrlResponse = http.get(
		apiUrl(`/files/${encodeURIComponent(ticket.objectId)}`),
			authParams('api_get_original_url'),
	);
	if (!check(downloadUrlResponse, {
		'download URL request returned 200': (response) => response.status === 200,
		'download URL is present': (response) => {
			try { return Boolean(response.json().url); } catch { return false; }
		},
	})) return;

	const downloadResponse = http.get(downloadUrlResponse.json().url, { tags: { name: 's3_download_original' } });
	check(downloadResponse, { 'S3 download succeeded': (response) => response.status === 200 });
}

export function requireReadableFixture() {
	if (!uploadFixture || uploadFixture.byteLength === 0) fail('O arquivo K6_UPLOAD_FILE está vazio ou não pôde ser lido.');
}
