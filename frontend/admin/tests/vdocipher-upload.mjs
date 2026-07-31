import assert from 'node:assert/strict';
import { uploadForm } from '../src/vdocipher-upload.js';

class FakeXhr {
  constructor(status) {
    this.status = status;
    this.upload = {};
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  send(body) {
    this.body = body;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
    this.onload();
  }
}

let progress = 0;
const ok = new FakeXhr(201);
await uploadForm('https://upload.test', { file: true }, (value) => { progress = value; }, () => ok);
assert.equal(ok.method, 'POST');
assert.equal(ok.url, 'https://upload.test');
assert.deepEqual(ok.body, { file: true });
assert.equal(progress, 50);

await assert.rejects(
  uploadForm('https://upload.test', {}, undefined, () => new FakeXhr(500)),
  /upload_failed/,
);

console.log('vdocipher browser upload self-check OK');
