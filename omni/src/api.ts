import { zipSync, strToU8 } from 'fflate';
export interface Task {
  id: string;
  kind: string;
  objective: string;
  model: string;
  status: string;
  result: string | null;
  error: string | null;
  steps: string;
  usage: string | null;
  created: number;
  updated: number;
}
export interface Bundle {
  summary: string;
  files: { path: string; content: string }[];
}
export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const result = (await response.json()) as { error?: string };
  if (!response.ok)
    throw new Error(result.error || `Request failed (${response.status})`);
  return result as T;
}
export function download(
  name: string,
  content: string,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function exportZip(bundle: Bundle, id: string) {
  const files = Object.fromEntries(
    bundle.files.map((file) => [file.path, strToU8(file.content)]),
  );
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(zipSync(files)).buffer], {
      type: 'application/zip',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `omni-${id}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function staticPreview(bundle: Bundle) {
  const html = bundle.files.find((f) => f.path === 'index.html')?.content || '';
  const css = bundle.files.find((f) => f.path === 'style.css')?.content || '';
  const document = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(
    'a abbr article aside b blockquote br button caption code col colgroup dd del details div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i label li main nav ol p pre s section small span strong style sub summary sup table tbody td th thead time tr u ul'.split(
      ' ',
    ),
  );
  const attributes = new Set(
    'class id style title role aria-label aria-hidden colspan rowspan'.split(
      ' ',
    ),
  );
  for (const node of Array.from(document.body.querySelectorAll('*'))) {
    if (!allowed.has(node.tagName.toLowerCase())) {
      node.remove();
      continue;
    }
    for (const attribute of Array.from(node.attributes))
      if (!attributes.has(attribute.name)) node.removeAttribute(attribute.name);
  }
  const headStyles = Array.from(document.head.querySelectorAll('style'))
    .map((node) => node.textContent)
    .join('\n');
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"><style>${(css + headStyles).replace(/</g, '\\3c ')}</style>${document.body.innerHTML}`;
}
