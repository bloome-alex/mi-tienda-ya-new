import crypto from 'node:crypto';

export const awsEncode = value => encodeURIComponent(String(value)).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
export const encodeR2Key = key => String(key).split('/').map(awsEncode).join('/');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => crypto.createHmac('sha256', key).update(value).digest();
const trimHeader = value => String(value).trim().replace(/\s+/g, ' ');

export function createSignedR2Request({ method, endpoint, bucket, key, accessKeyId, secretAccessKey, body = Buffer.alloc(0), contentType = '', cacheControl = '', extraHeaders = {}, now = new Date() }) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const target = new URL(endpoint);
  const canonicalUri = `/${awsEncode(bucket)}/${encodeR2Key(key)}`;
  const payloadHash = sha256(payload);
  const headers = {
    host: target.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(contentType ? { 'content-type': contentType } : {}),
    ...(cacheControl ? { 'cache-control': cacheControl } : {}),
    ...Object.fromEntries(Object.entries(extraHeaders).map(([name, value]) => [name.toLowerCase(), trimHeader(value)])),
  };
  const sortedNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedNames.map(name => `${name}:${trimHeader(headers[name])}\n`).join('');
  const signedHeaders = sortedNames.join(';');
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const dateKey = hmac(Buffer.from(`AWS4${secretAccessKey}`), date);
  const regionKey = hmac(dateKey, 'auto');
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const requestHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== 'host'));
  requestHeaders.authorization = authorization;
  return { url: `${target.origin}${canonicalUri}`, headers: requestHeaders, body: payload };
}
