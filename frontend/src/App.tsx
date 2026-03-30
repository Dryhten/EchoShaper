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
  const [callMethodModalOpen, setCallMethodModalOpen] = useState(false)

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

  const selectedPresetKeys = useMemo(() => new Set(presetSkills), [presetSkills])

  // 让启用状态与技能列表长度保持一致：
  // - 新增技能：默认启用
  // - 删除技能：自动截断
  useEffect(() => {
    setCustomSkillsEnabled((prev) => customSkills.map((_, idx) => prev[idx] ?? true))
  }, [customSkills, setCustomSkillsEnabled])

  function togglePreset(key: string) {
    setPresetSkills((prev) => {
      const set = new Set(prev)
      if (set.has(key)) set.delete(key)
      else set.add(key)
      return Array.from(set)
    })
  }

  function buildAutoWavName(file: File) {
    const base = file.name.replace(/\.[^/.]+$/, '').trim()
    return base || `web_${Date.now()}`
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
      const lexicon = parseLexiconInput(lexiconInput)
      const asrConfig = { wav_name: buildAutoWavName(asrFile) }
      const resp = await asrFileAsr(asrFile, asrConfig, lexicon)
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
      const asrConfig = { wav_name: buildAutoWavName(asrFile) }
      const resp = await asrFileShape(asrFile, postprocess, asrConfig)
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
            asr_config: {
              wav_name: `web_${Date.now()}`,
            },
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

  function openCallMethodModal() {
    setCallMethodModalOpen(true)
  }

  function closeCallMethodModal() {
    setCallMethodModalOpen(false)
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
        <header className="mb-6">
          <h1 className="text-3xl font-semibold">EchoShaper</h1>
          <p className="mt-2 text-sm text-gray-600">
            语音文本的后处理塑形，支持预设技能和自定义技能。
          </p>
        </header>

        <div className="space-y-6">
          <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-lg font-medium">LLM 配置</h2>

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
                <div className="text-sm text-gray-600">点击按钮验证模型连通性。</div>
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="text-lg font-medium">文本塑形</h2>
              <button
                type="button"
                className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
                onClick={openCallMethodModal}
              >
                调用方式
              </button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm text-gray-700">原始文本</span>
                <textarea
                  className="min-h-56 w-full resize-y rounded border px-3 py-2 text-sm"
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="把 ASR 输出的原始文本粘贴到这里..."
                />
              </label>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-800">预设技能</div>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESET_SKILLS.map((s) => (
                      <label
                        key={s.key}
                        className="flex items-center gap-2 rounded border px-3 py-2 text-sm"
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
                  <span className="text-sm text-gray-700">个人词库（纠错/替换）</span>
                  <input
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={lexiconInput}
                    onChange={(e) => setLexiconInput(e.target.value)}
                    placeholder="警官;回声作坊"
                  />
                  <div className="text-xs text-gray-600">
                    用英文分号 `;` 分隔词条（示例：`警官;EchoShaper`）。当文本中出现疑似 ASR 误识别时，模型会在语义允许的情况下用词库词替换。
                  </div>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-gray-700">个人偏好</span>
                  <input
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={personalPreference}
                    onChange={(e) => setPersonalPreference(e.target.value)}
                    placeholder="尽量简短，不要废话"
                  />
                </label>

                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-800">自定义技能（可添加多个）</div>
                      <div className="text-xs text-gray-600 mt-1">
                        可逐条选择是否启用，启用后会按顺序注入到后端 prompt。
                      </div>
                    </div>
                    <button
                      type="button"
                      className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white"
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
                        <div key={`${s.name}-${idx}`} className="rounded border bg-white p-3">
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
                              className="rounded border px-2 py-1 text-xs text-gray-800"
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
            </div>

            <div className="mt-4 flex items-start justify-between gap-4">
              <button
                type="button"
                className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                onClick={onRunShape}
                disabled={shapeLoading || !rawText.trim()}
              >
                {shapeLoading ? '塑形中...' : '开始塑形'}
              </button>

              {shapeError ? (
                <div className="text-sm text-red-700">{shapeError}</div>
              ) : (
                <div className="text-sm text-gray-600">
                  选择需要的预设技能/自定义技能后，点击开始塑形。
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-lg font-medium">上传音频文件识别</h2>
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-gray-800">选择 WAV 文件（PCM16 单声道，8k/16k）</span>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
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
                  <span className="text-sm text-gray-700">{asrFile?.name ?? '未选择文件'}</span>
                </div>
                <div className="text-xs text-gray-600">
                  后端当前仅支持 WAV（8k/16k），会在需要时把 16k 下采样到 8k。
                </div>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
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
                <div className="rounded border p-3 text-sm text-gray-700">
                  <div className="text-gray-600">wav_name</div>
                  <div className="font-medium">{asrFileAsrResult.wav_name}</div>
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

          <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-3 text-lg font-medium">语音流式识别（2PASS + 后处理）</h2>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                onClick={onStartAsrStream}
                disabled={asrWsStatus === 'connecting' || asrWsStatus === 'connected'}
              >
                {asrWsStatus === 'connecting' ? '连接中...' : asrWsStatus === 'connected' ? '已连接' : '开始录音'}
              </button>
              <button
                type="button"
                className="rounded border border-gray-200 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
                onClick={onStopAsrStream}
                disabled={asrWsStatus !== 'connected' && asrWsStatus !== 'stopping'}
              >
                停止
              </button>
              <div className="text-xs text-gray-600">后处理参数取自上方页面配置（与 `/api/v1/text/shape` 一致）。</div>
            </div>

            {asrError ? <div className="mt-3 text-sm text-red-700">{asrError}</div> : null}

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-gray-800">ASR 流式（online）</span>
                <textarea className="min-h-40 w-full resize-y rounded border px-3 py-2 text-sm" value={asrPartial} readOnly />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-gray-800">ASR 最终（offline）</span>
                <textarea className="min-h-40 w-full resize-y rounded border px-3 py-2 text-sm" value={asrFinal} readOnly />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-medium text-gray-800">后处理结果</span>
                <textarea
                  className="min-h-40 w-full resize-y rounded border px-3 py-2 text-sm"
                  value={asrShaped?.result_text ?? ''}
                  readOnly
                />
              </label>
            </div>
          </section>

          {shapeResult ? (
            <section className="rounded-lg border bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-medium">结果</h2>
                <div className="text-xs text-gray-500">
                  processed: {shapeResult.processed_length} / original: {shapeResult.original_length}
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <div className="rounded border p-3 text-sm">
                  <div className="text-gray-600">Prompt tokens</div>
                  <div className="text-base font-semibold">{shapeResult.tokens_used.prompt}</div>
                </div>
                <div className="rounded border p-3 text-sm">
                  <div className="text-gray-600">Completion tokens</div>
                  <div className="text-base font-semibold">{shapeResult.tokens_used.completion}</div>
                </div>
                <div className="rounded border p-3 text-sm">
                  <div className="text-gray-600">Total tokens</div>
                  <div className="text-base font-semibold">{shapeResult.tokens_used.total}</div>
                </div>
                <div className="rounded border p-3 text-sm">
                  <div className="text-gray-600">Web result creation time</div>
                  <div className="text-base font-semibold">{shapeResult.latency_ms} ms</div>
                </div>
              </div>

              <label className="mt-4 grid gap-2">
                <span className="text-sm font-medium text-gray-800">塑形结果文本</span>
                <textarea
                  className="min-h-56 w-full resize-y rounded border px-3 py-2 text-sm"
                  value={shapeResult.result_text}
                  readOnly
                />
              </label>
            </section>
          ) : null}
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
    {callMethodModalOpen ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={closeCallMethodModal}
      >
        <div
          className="w-full max-w-2xl rounded-lg bg-white p-6 text-gray-900 shadow-lg"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold">调用方式</h3>
              <div className="mt-1 text-xs text-gray-600">
                以下示例为同源部署：`/api/v1/...`。
              </div>
            </div>
            <button
              type="button"
              className="rounded border border-gray-200 px-2 py-1 text-sm text-gray-600"
              onClick={closeCallMethodModal}
            >
              X
            </button>
          </div>

          <div className="mt-4 space-y-5">
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-900">1) 塑形接口：POST `/api/v1/text/shape`</div>
              <div className="text-xs text-gray-600">curl 示例</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs leading-relaxed text-gray-800">
{`curl -X POST http://localhost:8058/api/v1/text/shape \\
  -H "Content-Type: application/json" \\
  -d '{
    "raw_text": "景观，这个人真不是我打的。",
    "llm_config": {
      "model_name": "qwen-plus",
      "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "api_key": "your-key"
    }
  }'`}
              </pre>
              <div className="text-xs text-gray-600">fetch 示例</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs leading-relaxed text-gray-800">
{`const payload = {
  raw_text: "景观，这个人真不是我打的。",
  llm_config: {
    model_name: "qwen-plus",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    api_key: "your-key"
  }
}

const resp = await fetch("/api/v1/text/shape", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
})

const data = await resp.json()
console.log(data)`}
              </pre>
              <div className="text-xs text-gray-600">
                返回字段包含：`result_text`、`tokens_used`、`latency_ms`。
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-900">2) 连通性测试：POST `/api/v1/llm/test`</div>
              <div className="text-xs text-gray-600">curl 示例</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs leading-relaxed text-gray-800">
{`curl -X POST http://localhost:8058/api/v1/llm/test \\
  -H "Content-Type: application/json" \\
  -d '{
    "model_name": "qwen-plus",
    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "api_key": "your-key"
  }'`}
              </pre>
              <div className="text-xs text-gray-600">fetch 示例</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-3 text-xs leading-relaxed text-gray-800">
{`const payload = {
  model_name: "qwen-plus",
  base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  api_key: "your-key"
}

const resp = await fetch("/api/v1/llm/test", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
})

const data = await resp.json()
console.log(data)`}
              </pre>
              <div className="text-xs text-gray-600">
                返回字段包含：`latency_ms`、`message`。
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null}
    </div>
  )
}
