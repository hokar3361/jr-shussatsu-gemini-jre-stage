export class AudioProcessor {
  private audioContext: AudioContext | null = null
  private workletNode: AudioWorkletNode | null = null
  private scriptNode: ScriptProcessorNode | null = null
  private initialized = false
  private useWorklet = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    this.audioContext = new AudioContext({ sampleRate: 24000 })
    
    try {
      // Try to use AudioWorklet
      await this.audioContext.audioWorklet.addModule('/pcm-processor.js')
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor')
      this.workletNode.connect(this.audioContext.destination)
      this.useWorklet = true
      console.log('AudioProcessor: Using AudioWorklet')
    } catch (error) {
      // Fallback to ScriptProcessorNode
      console.warn('AudioProcessor: AudioWorklet failed, using ScriptProcessorNode', error)
      this.scriptNode = this.audioContext.createScriptProcessor(4096, 1, 1)
      this.scriptNode.connect(this.audioContext.destination)
      this.useWorklet = false
    }
    
    this.initialized = true
  }

  async playAudioChunk(base64AudioChunk: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }

    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume()
    }

    const arrayBuffer = this.base64ToArrayBuffer(base64AudioChunk)
    const float32Data = this.convertPCM16LEToFloat32(arrayBuffer)
    
    if (this.useWorklet && this.workletNode) {
      this.workletNode.port.postMessage(float32Data)
    } else if (this.scriptNode) {
      // Use ScriptProcessorNode for playback
      const source = this.audioContext!.createBufferSource()
      const buffer = this.audioContext!.createBuffer(1, float32Data.length, 24000)
      buffer.copyToChannel(float32Data, 0)
      source.buffer = buffer
      source.connect(this.audioContext!.destination)
      source.start()
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  private convertPCM16LEToFloat32(pcmData: ArrayBuffer): Float32Array {
    const inputArray = new Int16Array(pcmData)
    const float32Array = new Float32Array(inputArray.length)
    for (let i = 0; i < inputArray.length; i++) {
      float32Array[i] = inputArray[i] / 32768
    }
    return float32Array
  }
}

export class AudioRecorder {
  private audioContext: AudioContext | null = null
  private processor: ScriptProcessorNode | null = null
  private stream: MediaStream | null = null
  private pcmData: number[] = []
  private interval: number | null = null
  private onChunk: ((data: string) => void) | null = null

  async start(onChunk: (data: string) => void, deviceId?: string): Promise<void> {
    this.onChunk = onChunk
    this.audioContext = new AudioContext({ sampleRate: 16000 })

    const constraints: MediaStreamConstraints = {
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        ...(deviceId && { deviceId: { exact: deviceId } })
      }
    }

    this.stream = await navigator.mediaDevices.getUserMedia(constraints)
    const source = this.audioContext.createMediaStreamSource(this.stream)
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0)
      // Convert float32 to int16
      const pcm16 = new Int16Array(inputData.length)
      for (let i = 0; i < inputData.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768))
      }
      this.pcmData.push(...pcm16)
    }

    source.connect(this.processor)
    this.processor.connect(this.audioContext.destination)

    // Send chunks every second
    this.interval = window.setInterval(() => this.sendChunk(), 1000)
  }

  private sendChunk(): void {
    if (this.pcmData.length === 0) return

    const buffer = new ArrayBuffer(this.pcmData.length * 2)
    const view = new DataView(buffer)
    this.pcmData.forEach((value, index) => {
      view.setInt16(index * 2, value, true) // little-endian
    })

    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
    this.onChunk?.(base64)
    this.pcmData = []
  }

  stop(): void {
    if (this.interval) {
      window.clearInterval(this.interval)
      this.interval = null
    }

    if (this.processor) {
      this.processor.disconnect()
      this.processor = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    this.pcmData = []
  }
}