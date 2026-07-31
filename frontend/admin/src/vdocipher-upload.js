export function uploadForm(url, body, onProgress = () => {}, createXhr = () => new XMLHttpRequest()) {
  return new Promise((resolve, reject) => {
    const xhr = createXhr();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('upload_failed'));
    xhr.onerror = () => reject(new Error('upload_failed'));
    xhr.send(body);
  });
}
