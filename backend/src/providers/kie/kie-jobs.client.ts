// kie.ai "Market" API ortak istemcisi
// Create: POST /api/v1/jobs/createTask  { model, input }        → data.taskId
// Poll:   GET  /api/v1/jobs/recordInfo?taskId=...               → data.state, data.resultJson
// State değerleri: waiting | queuing | generating | success | fail
// Docs: https://docs.kie.ai/market/common/get-task-detail

const KIE_BASE = 'https://api.kie.ai/api/v1';

interface KieEnvelope<T> {
  code: number;
  msg: string;
  data: T;
}

export async function kieCreateTask(
  apiKey: string,
  model: string,
  input: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
  });

  if (!res.ok) {
    throw new Error(`kie.ai createTask HTTP ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as KieEnvelope<{ taskId: string }>;
  if (body.code !== 200 || !body.data?.taskId) {
    throw new Error(`kie.ai createTask failed (${model}): ${body.msg ?? JSON.stringify(body)}`);
  }
  return body.data.taskId;
}

export async function kiePollTask(
  apiKey: string,
  taskId: string,
  opts: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<string> {
  const { intervalMs = 5000, maxAttempts = 120 } = opts; // varsayılan ~10 dk

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) continue; // geçici hata — polling'i öldürme

    const body = (await res.json()) as KieEnvelope<{
      state: string;
      resultJson?: string;
      failMsg?: string;
      failCode?: string;
    }>;

    const state = body.data?.state;
    if (state === 'success') {
      const result = JSON.parse(body.data.resultJson ?? '{}') as { resultUrls?: string[] };
      const url = result.resultUrls?.[0];
      if (!url) throw new Error(`kie.ai task ${taskId}: success ama resultUrls boş`);
      return url;
    }
    if (state === 'fail') {
      throw new Error(`kie.ai task ${taskId} failed: ${body.data.failMsg ?? body.data.failCode ?? 'unknown'}`);
    }
    // waiting | queuing | generating → beklemeye devam
  }

  throw new Error(`kie.ai task ${taskId} timed out (${(maxAttempts * intervalMs) / 60000} dk)`);
}
