import type {
  AsrFileAsrResponse,
  AsrFileShapeResponse,
  LLMConfig,
  LLMTestResponse,
  ProcessRequest,
  ShapeResponse,
} from './types'
import { requestForm, requestJson } from './client'

const LLM_TEST_PATH = '/api/v1/llm/test'
const TEXT_SHAPE_PATH = '/api/v1/text/shape'
const ASR_FILE_ASR_PATH = '/api/v1/asr/transcribe'
const ASR_FILE_SHAPE_PATH = '/api/v1/asr/transcribe/shape'

export async function llmTest(payload: LLMConfig): Promise<LLMTestResponse> {
  return requestJson<LLMTestResponse>(LLM_TEST_PATH, payload)
}

export async function shapeText(body: ProcessRequest): Promise<ShapeResponse> {
  return requestJson<ShapeResponse>(TEXT_SHAPE_PATH, body)
}

export async function asrFileAsr(
  file: File,
  asrConfig?: Record<string, unknown>,
  lexicon?: string[],
) {
  const form = new FormData()
  form.append('file', file)
  if (asrConfig) form.append('asr_config', JSON.stringify(asrConfig))
  if (lexicon && lexicon.length > 0) form.append('lexicon', JSON.stringify(lexicon))
  return requestForm<AsrFileAsrResponse>(ASR_FILE_ASR_PATH, form)
}

export async function asrFileShape(
  file: File,
  postprocess: Record<string, unknown>,
  asrConfig?: Record<string, unknown>,
) {
  const form = new FormData()
  form.append('file', file)
  form.append('postprocess', JSON.stringify(postprocess))
  if (asrConfig) form.append('asr_config', JSON.stringify(asrConfig))
  return requestForm<AsrFileShapeResponse>(ASR_FILE_SHAPE_PATH, form)
}

