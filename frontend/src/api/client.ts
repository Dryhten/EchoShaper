import type { ApiErrorBody } from './types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function buildUrl(path: string) {
  const base = normalizeBaseUrl(API_BASE_URL)
  if (!base) return path.startsWith('/') ? path : `/${path}`
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

export class ApiError extends Error {
  status: number
  body?: ApiErrorBody

  constructor(message: string, status: number, body?: ApiErrorBody) {
    super(message)
    this.status = status
    this.body = body
  }
}

export async function requestJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.ok) {
    return (await res.json()) as T
  }

  let parsed: ApiErrorBody | undefined
  try {
    parsed = (await res.json()) as ApiErrorBody
  } catch {
    // ignore
  }

  const message =
    parsed?.detail ??
    parsed?.message ??
    (typeof parsed === 'object' ? 'Request failed' : res.statusText) ??
    'Request failed'

  throw new ApiError(message, res.status, parsed)
}

export async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    body: form,
  })

  if (res.ok) {
    return (await res.json()) as T
  }

  let parsed: ApiErrorBody | undefined
  try {
    parsed = (await res.json()) as ApiErrorBody
  } catch {
    // ignore
  }

  const message =
    parsed?.detail ??
    parsed?.message ??
    (typeof parsed === 'object' ? 'Request failed' : res.statusText) ??
    'Request failed'

  throw new ApiError(message, res.status, parsed)
}

