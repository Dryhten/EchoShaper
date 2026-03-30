export type LLMConfig = {
  model_name: string
  base_url: string
  api_key: string
}

export type CustomSkill = {
  name: string
  description: string
  instruction: string
}

export type ProcessRequest = {
  raw_text: string
  llm_config: LLMConfig
  preset_skills: string[]
  custom_skills: CustomSkill[]
  lexicon: string[]
  personal_preference: string
}

export type LLMTestResponse = {
  status: string
  latency_ms: number
  message: string
}

export type ShapeTokensUsed = {
  prompt: number
  completion: number
  total: number
}

export type ShapeResponse = {
  status: string
  original_length: number
  processed_length: number
  result_text: string
  tokens_used: ShapeTokensUsed
  latency_ms: number
}

export type AsrFileAsrResponse = {
  status: string
  wav_name: string
  asr_text: string
  raw_offline: Record<string, unknown>
}

export type AsrFileShapeResponse = {
  status: string
  wav_name: string
  asr_text: string
  raw_offline: Record<string, unknown>
  shape: ShapeResponse
}

export type ApiErrorBody = {
  status?: string
  message?: string
  detail?: string
  [k: string]: unknown
}

