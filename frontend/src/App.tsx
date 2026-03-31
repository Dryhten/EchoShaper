import { useEffect, useMemo, useState } from 'react'
import { ApiError } from './api/client'
import { asrFileAsr, asrFileShape, llmTest, shapeText } from './api/echoShaper'
import type { AsrFileAsrResponse, AsrFileShapeResponse, CustomSkill, LLMConfig, ShapeResponse } from './api/types'

const PRESET_SKILLS: Array<{ key: string; label: string }> = [
  { key: 'protect_lexicon', label: '词库保护' },
  { key: 'auto_structure', label: '自动结构化' },
  { key: 'filter_fillers', label: '口语过滤' },
  { key: 'remove_trailing_period', label: '去除末尾句号' },
]

const DEFAULT_PRESETS = PRESET_SKILLS.map((s) => s.key)

function useLocalStorageState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue

    try {
      const raw = localStorage.getItem(key)
      if (!raw) return initialValue
      return JSON.parse(raw) as T
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // ignore quota / private mode
    }
  }, [key, value])

  return [value, setValue] as const
}

function parseLexiconInput(input: string) {
  return input
    .split(/[;；,\n，]+/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

function formatError(err: unknown) {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}

export default function App() {
  const [llmConfig, setLlmConfig] = useLocalStorageState<LLMConfig>(
    'echoshaper_llm_config',
    {
      model_name: 'qwen-plus',
      base_url:
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
      api_key: 'your-key',
    },
  )

  const [rawText, setRawText] = useState('景观，这个人真不是我打的。')
  const [presetSkills, setPresetSkills] = useLocalStorageState<string[]>(
    'echoshaper_preset_skills',
    DEFAULT_PRESETS,
  )
  const [lexiconInput, setLexiconInput] = useLocalStorageState<string>(
    'echoshaper_lexicon_input',
    '警官;回声作坊',
  )
  const [personalPreference, setPersonalPreference] = useLocalStorageState<string>(
    'echoshaper_personal_preference',
    '尽量简短，不要废话',
  )

  const [customSkills, setCustomSkills] = useLocalStorageState<CustomSkill[]>(
    'echoshaper_custom_skills',
    [],
  )
  const [customSkillsEnabled, setCustomSkillsEnabled] = useLocalStorageState<boolean[]>(
    'echoshaper_custom_skills_enabled',
    [],
  )

  const [skillModalOpen, setSkillModalOpen] = useState(false)
  const [skillDraftName, setSkillDraftName] = useState('')
  const [skillDraftDescription, setSkillDraftDescription] = useState('')
  const [skillDraftInstruction, setSkillDraftInstruction] = useState('')
  const [skillDraftError, setSkillDraftError] = useState<string | null>(null)

  const [llmTestLoading, setLlmTestLoading] = useState(false)
  const [llmTestError, setLlmTestError] = useState<string | null>(null)
  const [llmTestResult, setLlmTestResult] = useState<{
    latency_ms: number
    message: string
  } | null>(null)

  const [shapeLoading, setShapeLoading] = useState(false)
  const [shapeError, setShapeError] = useState<string | null>(null)
  const [shapeResult, setShapeResult] = useState<ShapeResponse | null>(null)

  const [asrWsStatus, setAsrWsStatus] = useState<'idle' | 'connecting' | 'connected' | 'stopping' | 'error'>('idle')
  const [asrPartial, setAsrPartial] = useState('')
  const [asrFinal, setAsrFinal] = useState('')
  const [asrShaped, setAsrShaped] = useState<ShapeResponse | null>(null)
  const [asrError, setAsrError] = useState<string | null>(null)

  const [asrFile, setAsrFile] = useState<File | null>(null)
  const [asrFileLoading, setAsrFileLoading] = useState(false)
  const [asrFileError, setAsrFileError] = useState<string | null>(null)
  const [asrFileAsrResult, setAsrFileAsrResult] = useState<AsrFileAsrResponse | null>(null)
  const [asrFileShapeResult, setAsrFileShapeResult] = useState<AsrFileShapeResponse | null>(null)
  const [asrHotwordsInput, setAsrHotwordsInput] = useLocalStorageState<string>(
    'echoshaper_asr_hotwords_json',
    '',
  )

  const selectedPresetKeys = useMemo(() => new Set(presetSkills), [presetSkills])

  // 让启用状态与技能列表长度保持一致：
  // - 新增技能：默认启用
  // - 删除技能：自动截断
  useEffect(() => {
    setCustomSkillsEnabled((prev) => customSkills.map((_, idx) => prev[idx] ?? true))
  }, [customSkills, setCustomSkillsEnabled])

  function optionalAsrConfig(): Record<string, unknown> | undefined {
    const hotwords = asrHotwordsInput.trim()
    if (!hotwords) return undefined
    return { hotwords }
  }

  function togglePreset(key: string) {
    setPresetSkills((prev) => {
      const set = new Set(prev)
      if (set.has(key)) set.delete(key)
      else set.add(key)
      return Array.from(set)
    })
  }

  async function onRunLlmTest() {
    setLlmTestLoading(true)
    setLlmTestError(null)
    setLlmTestResult(null)

    try {
      const resp = await llmTest(llmConfig)
      setLlmTestResult({
        latency_ms: resp.latency_ms,
        message: resp.message,
      })
    } catch (err) {
      setLlmTestError(formatError(err))
    } finally {
      setLlmTestLoading(false)
    }
  }

  async function onRunShape() {
    setShapeLoading(true)
    setShapeError(null)
    setShapeResult(null)

    try {
      const enabledCustomSkills = customSkills.filter((_, idx) => customSkillsEnabled[idx] ?? true)
      const body = {
        raw_text: rawText,
        llm_config: llmConfig,
        preset_skills: presetSkills,
        custom_skills: enabledCustomSkills,
        lexicon: parseLexiconInput(lexiconInput),
        personal_preference: personalPreference,
      }

      const resp = await shapeText(body)
      setShapeResult(resp)
    } catch (err) {
      setShapeError(formatError(err))
    } finally {
      setShapeLoading(false)
    }
  }

  async function onAsrFileAsr() {
    if (!asrFile) return
    setAsrFileLoading(true)
    setAsrFileError(null)
    setAsrFileAsrResult(null)
    setAsrFileShapeResult(null)

    try {
      const resp = await asrFileAsr(asrFile, optionalAsrConfig())
      setAsrFileAsrResult(resp)
    } catch (e) {
      setAsrFileError(formatError(e))
    } finally {
      setAsrFileLoading(false)
    }
  }

  async function onAsrFileShape() {
    if (!asrFile) return
    setAsrFileLoading(true)
    setAsrFileError(null)
    setAsrFileAsrResult(null)
    setAsrFileShapeResult(null)

    try {
      const enabledCustomSkills = customSkills.filter((_, idx) => customSkillsEnabled[idx] ?? true)
      const postprocess = {
        llm_config: llmConfig,
        preset_skills: presetSkills,
        custom_skills: enabledCustomSkills,
        lexicon: parseLexiconInput(lexiconInput),
        personal_preference: personalPreference,
      }
      const resp = await asrFileShape(asrFile, postprocess, optionalAsrConfig())
      setAsrFileShapeResult(resp)
    } catch (e) {
      setAsrFileError(formatError(e))
    } finally {
      setAsrFileLoading(false)
    }
  }

  function _wsUrlFor(pathname: string) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}${pathname}`
  }

  async function onStartAsrStream() {
    if (asrWsStatus === 'connecting' || asrWsStatus === 'connected') return

    setAsrWsStatus('connecting')
    setAsrPartial('')
    setAsrFinal('')
    setAsrShaped(null)
    setAsrError(null)

    const url = _wsUrlFor('/api/v1/asr/stream')
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'

    let audioContext: AudioContext | null = null
    let source: MediaStreamAudioSourceNode | null = null
    let processor: ScriptProcessorNode | null = null
    let stream: MediaStream | null = null

    const targetSampleRate = 16000

    function downsampleTo16k(input: Float32Array, inSampleRate: number) {
      if (inSampleRate === targetSampleRate) return input
      const ratio = inSampleRate / targetSampleRate
      const outLen = Math.floor(input.length / ratio)
      const out = new Float32Array(outLen)
      let offset = 0
      for (let i = 0; i < outLen; i++) {
        const nextOffset = Math.floor((i + 1) * ratio)
        let sum = 0
        let count = 0
        for (let j = offset; j < nextOffset && j < input.length; j++) {
          sum += input[j]
          count++
        }
        out[i] = count ? sum / count : 0
        offset = nextOffset
      }
      return out
    }

    function floatToInt16PcmBytes(float32: Float32Array) {
      const buf = new ArrayBuffer(float32.length * 2)
      const view = new DataView(buf)
      for (let i = 0; i < float32.length; i++) {
        let s = float32[i] ?? 0
        if (s > 1) s = 1
        if (s < -1) s = -1
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      }
      return buf
    }

    async function cleanup() {
      try {
        processor?.disconnect()
      } catch {
        // ignore
      }
      try {
        source?.disconnect()
      } catch {
        // ignore
      }
      try {
        stream?.getTracks().forEach((t) => t.stop())
      } catch {
        // ignore
      }
      try {
        await audioContext?.close()
      } catch {
        // ignore
      }
      processor = null
      source = null
      stream = null
      audioContext = null
    }

    ws.onopen = async () => {
      setAsrWsStatus('connected')

      try {
        const enabledCustomSkills = customSkills.filter((_, idx) => customSkillsEnabled[idx] ?? true)
        ws.send(
          JSON.stringify({
            postprocess: {
              llm_config: llmConfig,
              preset_skills: presetSkills,
              custom_skills: enabledCustomSkills,
              lexicon: parseLexiconInput(lexiconInput),
              personal_preference: personalPreference,
            },
            asr_config: optionalAsrConfig() ?? {},
          }),
        )

        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioContext = new AudioContext()
        source = audioContext.createMediaStreamSource(stream)
        processor = audioContext.createScriptProcessor(4096, 1, 1)
        source.connect(processor)
        processor.connect(audioContext.destination)

        processor.onaudioprocess = (ev) => {
          if (ws.readyState !== WebSocket.OPEN) return
          const input = ev.inputBuffer.getChannelData(0)
          const down = downsampleTo16k(input, audioContext?.sampleRate ?? 48000)
          const pcm = floatToInt16PcmBytes(down)
          ws.send(pcm)
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setAsrError(msg)
        setAsrWsStatus('error')
        try {
          ws.close()
        } catch {
          // ignore
        }
      }
    }

    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as unknown
        if (typeof parsed !== 'object' || parsed === null) return

        const obj = parsed as Record<string, unknown>
        const type = typeof obj.type === 'string' ? obj.type : ''
        const text = typeof obj.text === 'string' ? obj.text : ''
        const message = typeof obj.message === 'string' ? obj.message : ''

        if (type === 'asr.partial') setAsrPartial(text)
        else if (type === 'asr.final') setAsrFinal(text)
        else if (type === 'shape.result') {
          const data = obj.data
          setAsrShaped((typeof data === 'object' && data !== null ? (data as ShapeResponse) : null))
        } else if (type === 'error') setAsrError(message || 'unknown error')
      } catch {
        // ignore
      }
    }

    ws.onerror = () => {
      setAsrWsStatus('error')
      setAsrError('WebSocket 连接失败')
    }

    ws.onclose = () => {
      setAsrWsStatus('idle')
      void cleanup()
    }

    ;(window as unknown as { __echoshaper_asr_ws?: WebSocket }).__echoshaper_asr_ws = ws
  }

  function onStopAsrStream() {
    const ws = (window as unknown as { __echoshaper_asr_ws?: WebSocket }).__echoshaper_asr_ws
    if (!ws || (ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) return
    setAsrWsStatus('stopping')
    try {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' }))
    } catch {
      // ignore
    }
    try {
      ws.close()
    } catch {
      // ignore
    }
  }

  function onRemoveCustomSkill(index: number) {
    const next = customSkills.filter((_, i) => i !== index)
    setCustomSkills(next)
  }

  function openSkillModal() {
    setSkillDraftName('')
    setSkillDraftDescription('')
    setSkillDraftInstruction('')
    setSkillDraftError(null)
    setSkillModalOpen(true)
  }

  function closeSkillModal() {
    setSkillModalOpen(false)
    setSkillDraftError(null)
  }

  function onAddSkillFromModal() {
    setSkillDraftError(null)

    const name = skillDraftName.trim()
    const description = skillDraftDescription.trim()
    const instruction = skillDraftInstruction.trim()

    if (!name) {
      setSkillDraftError('技能名称不能为空')
      return
    }
    if (!description) {
      setSkillDraftError('描述不能为空')
      return
    }
    if (!instruction) {
      setSkillDraftError('指令不能为空')
      return
    }

    const next = [
      ...customSkills,
      {
        name,
        description,
        instruction,
      },
    ]

    setCustomSkills(next)
    closeSkillModal()
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-8 border-b border-gray-200 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">EchoShaper</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
            先配置大模型与塑形规则，再对文本或语音结果做整理。支持文本粘贴塑形、上传 WAV、实时麦克风识别。
          </p>
        </header>

        <div className="space-y-8">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold text-gray-900">大模型</h2>
            <p className="mb-4 text-sm text-gray-600">塑形与连通性测试使用的接口地址与密钥。</p>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm text-gray-700">模型名</span>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={llmConfig.model_name}
                  onChange={(e) =>
                    setLlmConfig((prev) => ({
                      ...prev,
                      model_name: e.target.value,
                    }))
                  }
                />
              </label>

              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm text-gray-700">Base URL</span>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={llmConfig.base_url}
                  onChange={(e) =>
                    setLlmConfig((prev) => ({
                      ...prev,
                      base_url: e.target.value,
                    }))
                  }
                />
              </label>

              <label className="grid gap-1 md:col-span-3">
                <span className="text-sm text-gray-700">API Key</span>
                <input
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={llmConfig.api_key}
                  onChange={(e) =>
                    setLlmConfig((prev) => ({
                      ...prev,
                      api_key: e.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="mt-4 flex items-start justify-between gap-4">
              <button
                type="button"
                className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                onClick={onRunLlmTest}
                disabled={llmTestLoading}
              >
                {llmTestLoading ? '测试中...' : '测试连通性'}
              </button>

              {llmTestError ? (
                <div className="text-sm text-red-700">{llmTestError}</div>
              ) : llmTestResult ? (
                <div className="text-sm">
                  <div className="font-medium">{llmTestResult.message}</div>
                  <div className="text-gray-600">延迟：{llmTestResult.latency_ms} ms</div>
                </div>
              ) : (
                <div className="text-sm text-gray-600">检查当前配置能否正常调用模型。</div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold text-gray-900">塑形配置</h2>
            <p className="mb-5 text-sm text-gray-600">
              预设技能、词库与偏好会用于文本塑形，以及上传音频「识别 + 后处理」、实时语音识别中的后处理环节。
            </p>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-800">预设技能</div>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESET_SKILLS.map((s) => (
                      <label
                        key={s.key}
                        className="flex items-center gap-2 rounded border border-gray-200 px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPresetKeys.has(s.key)}
                          onChange={() => togglePreset(s.key)}
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </div>

                <label className="grid gap-1">
                  <span className="text-sm text-gray-700">个人词库</span>
                  <input
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    value={lexiconInput}
                    onChange={(e) => setLexiconInput(e.target.value)}
                    placeholder="警官;回声作坊"
                  />
                  <p className="text-xs text-gray-500">塑形时优先保留或纠正这些词，多个词用英文分号分隔。</p>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-gray-700">个人偏好</span>
                  <input
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    value={personalPreference}
                    onChange={(e) => setPersonalPreference(e.target.value)}
                    placeholder="尽量简短，不要废话"
                  />
                </label>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800">自定义技能</div>
                    <p className="mt-1 text-xs text-gray-500">勾选参与塑形，按列表顺序生效。</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white"
                    onClick={openSkillModal}
                  >
                    添加技能
                  </button>
                </div>

                {customSkills.length === 0 ? (
                  <div className="text-sm text-gray-600">暂无自定义技能</div>
                ) : (
                  <div className="space-y-2">
                    {customSkills.map((s, idx) => (
                      <div key={`${s.name}-${idx}`} className="rounded border border-gray-200 bg-gray-50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex min-w-0 cursor-pointer items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={customSkillsEnabled[idx] ?? true}
                              onChange={(e) => {
                                const checked = e.target.checked
                                setCustomSkillsEnabled((prev) =>
                                  customSkills.map((_, i) => (i === idx ? checked : prev[i] ?? true)),
                                )
                              }}
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-gray-900">{s.name}</div>
                              <div className="text-xs text-gray-600">{s.description}</div>
                            </div>
                          </label>
                          <button
                            type="button"
                            className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-800"
                            onClick={() => onRemoveCustomSkill(idx)}
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold text-gray-900">文本塑形</h2>
            <p className="mb-4 text-sm text-gray-600">
              对已有文本做整理（使用上方「塑形配置」）。上传音频与实时识别中的后处理也会沿用同一套配置。
            </p>

            <div className="flex min-w-0 flex-col gap-4">
              <label className="grid gap-2">
                <span className="text-sm text-gray-700">原始文本</span>
                <textarea
                  className="min-h-56 w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="把 ASR 输出的原始文本粘贴到这里..."
                />
              </label>

              {shapeResult ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900">塑形结果</span>
                    <span className="text-xs text-gray-500">
                      输出 {shapeResult.processed_length} 字 / 原文 {shapeResult.original_length} 字
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded border border-white bg-white px-2 py-1.5 text-xs">
                      <div className="text-gray-500">Prompt</div>
                      <div className="font-semibold text-gray-900">{shapeResult.tokens_used.prompt}</div>
                    </div>
                    <div className="rounded border border-white bg-white px-2 py-1.5 text-xs">
                      <div className="text-gray-500">Completion</div>
                      <div className="font-semibold text-gray-900">{shapeResult.tokens_used.completion}</div>
                    </div>
                    <div className="rounded border border-white bg-white px-2 py-1.5 text-xs">
                      <div className="text-gray-500">合计</div>
                      <div className="font-semibold text-gray-900">{shapeResult.tokens_used.total}</div>
                    </div>
                    <div className="rounded border border-white bg-white px-2 py-1.5 text-xs">
                      <div className="text-gray-500">耗时</div>
                      <div className="font-semibold text-gray-900">{shapeResult.latency_ms} ms</div>
                    </div>
                  </div>

                  <label className="mt-3 grid gap-2">
                    <span className="text-sm text-gray-700">输出文本</span>
                    <textarea
                      className="min-h-40 w-full resize-y rounded border border-gray-300 bg-white px-3 py-2 text-sm"
                      value={shapeResult.result_text}
                      readOnly
                    />
                  </label>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex items-start justify-between gap-4 border-t border-gray-100 pt-4">
              <button
                type="button"
                className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                onClick={onRunShape}
                disabled={shapeLoading || !rawText.trim()}
              >
                {shapeLoading ? '塑形中...' : '开始塑形'}
              </button>

              {shapeError ? (
                <div className="text-sm text-red-700">{shapeError}</div>
              ) : (
                <p className="text-sm text-gray-500">粘贴或输入原文后点击开始。</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold text-gray-900">上传音频识别</h2>
            <p className="mb-5 text-sm text-gray-600">
              从本机选择 WAV，只做转写，或转写后再做与「文本塑形」相同规则的后处理。
            </p>

            <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
              <div className="space-y-2">
                <span className="text-sm font-medium text-gray-800">音频文件</span>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
                    选择文件
                    <input
                      type="file"
                      accept=".wav,audio/wav"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null
                        setAsrFile(f)
                        setAsrFileError(null)
                        setAsrFileAsrResult(null)
                        setAsrFileShapeResult(null)
                      }}
                    />
                  </label>
                  <span className="text-sm text-gray-700">{asrFile?.name ?? '未选择'}</span>
                </div>
                <p className="text-xs text-gray-500">单声道 WAV，8k 或 16k 采样率。</p>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-gray-800">ASR识别热词（可选）</span>
                <textarea
                  className="min-h-[5.5rem] w-full resize-y rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
                  value={asrHotwordsInput}
                  onChange={(e) => setAsrHotwordsInput(e.target.value)}
                  placeholder='{"专有名词":36}'
                />
                <p className="text-xs text-gray-500">希望识别阶段更偏向某些词时填写；数字为权重，越大越优先。</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
              <button
                type="button"
                className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                onClick={onAsrFileAsr}
                disabled={!asrFile || asrFileLoading}
              >
                {asrFileLoading ? '处理中...' : '仅识别'}
              </button>
              <button
                type="button"
                className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                onClick={onAsrFileShape}
                disabled={!asrFile || asrFileLoading}
              >
                {asrFileLoading ? '处理中...' : '识别 + 后处理'}
              </button>
              {asrFileError ? <div className="text-sm text-red-700">{asrFileError}</div> : null}
            </div>

            {asrFileAsrResult ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-gray-800">识别文本</span>
                  <textarea
                    className="min-h-40 w-full resize-y rounded border px-3 py-2 text-sm"
                    value={asrFileAsrResult.asr_text}
                    readOnly
                  />
                </label>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  <div className="text-gray-500">本次任务编号</div>
                  <div className="mt-1 font-mono text-sm font-medium text-gray-900">{asrFileAsrResult.wav_name}</div>
                </div>
              </div>
            ) : null}

            {asrFileShapeResult ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-gray-800">识别文本</span>
                  <textarea
                    className="min-h-40 w-full resize-y rounded border px-3 py-2 text-sm"
                    value={asrFileShapeResult.asr_text}
                    readOnly
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-gray-800">后处理结果</span>
                  <textarea
                    className="min-h-40 w-full resize-y rounded border px-3 py-2 text-sm"
                    value={asrFileShapeResult.shape.result_text}
                    readOnly
                  />
                </label>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-lg font-semibold text-gray-900">实时语音识别</h2>
            <p className="mb-4 text-sm text-gray-600">
              使用麦克风连续识别；塑形沿用本页「大模型」「文本塑形」中的词库与技能；ASR识别热词与上传音频处相同。
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                onClick={onStartAsrStream}
                disabled={asrWsStatus === 'connecting' || asrWsStatus === 'connected'}
              >
                {asrWsStatus === 'connecting' ? '连接中...' : asrWsStatus === 'connected' ? '录音中' : '开始录音'}
              </button>
              <button
                type="button"
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                onClick={onStopAsrStream}
                disabled={asrWsStatus !== 'connected' && asrWsStatus !== 'stopping'}
              >
                停止
              </button>
            </div>

            {asrError ? <div className="mt-3 text-sm text-red-700">{asrError}</div> : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-gray-800">实时转写</span>
                <textarea
                  className="min-h-40 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={asrPartial}
                  readOnly
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-gray-800">本句定稿</span>
                <textarea
                  className="min-h-40 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={asrFinal}
                  readOnly
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-gray-800">塑形结果</span>
                <textarea
                  className="min-h-40 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={asrShaped?.result_text ?? ''}
                  readOnly
                />
              </label>
            </div>
          </section>

        </div>
      </div>

    {skillModalOpen ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={closeSkillModal}
      >
        <div
          className="w-full max-w-xl rounded-lg bg-white p-6 text-gray-900 shadow-lg"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">添加技能</h3>
              <div className="mt-1 text-xs text-gray-600">
                你可以连续添加多个自定义技能。
              </div>
            </div>
            <button
              type="button"
              className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-600"
              onClick={closeSkillModal}
            >
              X
            </button>
          </div>

          <div className="mt-4 space-y-4">
            <label className="grid gap-1">
              <div className="text-sm font-medium text-gray-700">技能名称</div>
              <input
                className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                value={skillDraftName}
                onChange={(e) => setSkillDraftName(e.target.value)}
                placeholder="例如：formal-tone"
              />
            </label>

            <label className="grid gap-1">
              <div className="text-sm font-medium text-gray-700">描述</div>
              <input
                className="w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                value={skillDraftDescription}
                onChange={(e) => setSkillDraftDescription(e.target.value)}
                placeholder="简单描述技能效果，例如：将口语化改为正式商务表达"
              />
            </label>

            <label className="grid gap-1">
              <div className="text-sm font-medium text-gray-700">指令</div>
              <textarea
                className="min-h-28 w-full resize-y rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                value={skillDraftInstruction}
                onChange={(e) => setSkillDraftInstruction(e.target.value)}
                placeholder="技能执行时 AI 遵循的具体规则与要求"
              />
            </label>

            {skillDraftError ? (
              <div className="text-sm text-red-600">{skillDraftError}</div>
            ) : null}
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700"
              onClick={closeSkillModal}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white"
              onClick={onAddSkillFromModal}
            >
              添加
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </div>
  )
}
