export type QueuedPost = {
  id: string;
  url: string;
  fields: Record<string, string | string[]>;
  createdAt: number;
};

const KEY = "cj_offline_queue_v1";
const MAX_ITEMS = 50;

function readQueue(): QueuedPost[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedPost[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    // storage full/blocked — nothing else we can do
  }
}

export function queueCount(): number {
  return readQueue().length;
}

export function enqueuePost(url: string, fields: Record<string, string | string[]>): QueuedPost {
  const item: QueuedPost = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    fields,
    createdAt: Date.now()
  };
  const items = readQueue();
  items.push(item);
  writeQueue(items);
  return item;
}

export function fieldsFromFormData(fd: FormData): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {};
  fd.forEach((v, k) => {
    const s = String(v);
    const cur = fields[k];
    if (cur === undefined) fields[k] = s;
    else if (Array.isArray(cur)) fields[k] = [...cur, s];
    else fields[k] = [cur, s];
  });
  return fields;
}

// Replays queued posts in order. Any HTTP response counts as delivered
// (server-side redirects/validations are final decisions); only network
// failures keep items queued. Stops on first network failure.
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  const items = readQueue();
  if (!items.length) return { sent: 0, remaining: 0 };

  const remaining: QueuedPost[] = [];
  let sent = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      const fd = new FormData();
      for (const [k, v] of Object.entries(it.fields)) {
        if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
        else fd.append(k, v);
      }
      await fetch(it.url, { method: "POST", body: fd, credentials: "same-origin" });
      sent++;
    } catch {
      remaining.push(it, ...items.slice(i + 1));
      break;
    }
  }

  writeQueue(remaining);
  return { sent, remaining: remaining.length };
}
