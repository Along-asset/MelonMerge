<template>
  <div class="wm-root" :class="{ paused: phase === 'paused' }">
    <div class="wm-bg" aria-hidden="true">
      <div class="wm-grid"></div>
      <div class="wm-scanlines"></div>
      <div class="wm-glow-orb"></div>
    </div>

    <!-- 顶部导航栏已取消：改为悬浮控件（位置不变，但不占用高度） -->
    <div class="wm-top-ui" aria-hidden="false">
      <div class="wm-top-left">
        <div class="wm-title">
          <span class="wm-emoji">🍉</span>
          <span class="wm-title-text">赛博大西瓜</span>
        </div>
        <div class="wm-chip">
          <span class="k">分数</span>
          <span class="v">{{ score }}</span>
        </div>
        <div class="wm-chip">
          <span class="k">最高</span>
          <span class="v">{{ bestScore }}</span>
        </div>
      </div>

      <div class="wm-top-right">
        <button class="wm-btn wm-btn--cyber" @click="togglePause" :disabled="phase === 'start' || phase === 'gameover'">
          {{ phase === 'paused' ? '继续' : '暂停' }}
        </button>
        <button class="wm-btn wm-btn--cyber" @click="restart" :disabled="phase === 'start'">重开</button>
        <button class="wm-btn wm-btn--cyber wm-exit" @click="handleReturnClick">
          <img src="@/images/icons/ChoiceReactionTime2Options/Exit.svg" alt="退出" class="wm-exit-icon">
          退出
        </button>
      </div>
    </div>

    <main class="wm-stage" ref="stageRef" tabindex="0" @keydown="handleKeyDown">
      <div class="wm-board" ref="boardRef">
        <canvas ref="canvasRef" class="wm-canvas"></canvas>

        <transition name="wm-fade">
          <div v-if="phase === 'start'" class="wm-overlay">
            <div class="wm-modal">
              <div class="wm-modal-title wm-modal-title--cyber wm-glitch" data-text="赛博大西瓜">赛博大西瓜</div>
              <div class="wm-modal-sub wm-modal-sub--large">控制投放位置，同级碰撞自动合并升级</div>
              <div class="wm-modal-rules wm-modal-rules--boxes">
                <div class="wm-rule-box">
                  <div class="wm-rule-head">◈胜负◈</div>
                  <div class="wm-rule-body">水果越过顶部危险线并持续一段时间即失败</div>
                </div>
                <div class="wm-rule-box wm-rule-box--purple">
                  <div class="wm-rule-head">◈技巧◈</div>
                  <div class="wm-rule-body">让相同等级尽量集中，减少“卡位”</div>
                </div>
              </div>
              <button class="wm-primary" @click="startGame">
                <span class="wm-primary-glow"></span>
                开始游戏
              </button>
            </div>
          </div>
        </transition>

        <transition name="wm-fade">
          <div v-if="phase === 'gameover'" class="wm-overlay">
            <div class="wm-modal">
              <div class="wm-modal-title">游戏结束</div>
              <div class="wm-modal-sub">本局得分：<b>{{ score }}</b>（最高：<b>{{ bestScore }}</b>）</div>
              <div class="wm-modal-actions wm-modal-actions--equal">
                <button class="wm-primary" @click="restartAndPlay">
                  <span class="wm-primary-glow"></span>
                  再来一局
                </button>
                <button class="wm-primary" @click="handleReturnClick">
                  <span class="wm-primary-glow"></span>
                  返回
                </button>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Engine, World, Bodies, Body, Composite, Events, Runner } from 'matter-js'
import { useTaskReturn } from '@/core/utils/taskReturnHelper.js'
import fruit00 from '@/images/fruits/00.png'
import fruit01 from '@/images/fruits/01.png'
import fruit02 from '@/images/fruits/02.png'
import fruit03 from '@/images/fruits/03.png'
import fruit04 from '@/images/fruits/04.png'
import fruit05 from '@/images/fruits/05.png'
import fruit06 from '@/images/fruits/06.png'
import fruit07 from '@/images/fruits/07.png'
import fruit08 from '@/images/fruits/08.png'
import fruit09 from '@/images/fruits/09.png'
import fruit10 from '@/images/fruits/10.png'
import fruit11 from '@/images/fruits/11.png'

const { returnToPrevious } = useTaskReturn()

const stageRef = ref(null)
const boardRef = ref(null)
const canvasRef = ref(null)

const phase = ref('start') // start | playing | paused | gameover
const score = ref(0)
const bestScore = ref(Number(localStorage.getItem('watermelonMerge:bestScore') || 0))

// 特效解锁标记
const hasPineapple = ref(false) // 是否出现过菠萝（level 7）
const hasCoconut = ref(false) // 是否出现过椰子（level 8）

// 粒子系统
const particles = ref([]) // 蓝色粒子数组

// ==================== 音效系统 ====================
const sfxEnabled = ref(true)
let audioCtx = null
let masterGain = null

const initAudio = () => {
  if (audioCtx) return
  const Ctx = window.AudioContext || window.webkitAudioContext
  audioCtx = new Ctx()
  masterGain = audioCtx.createGain()
  masterGain.gain.value = 9.0
  masterGain.connect(audioCtx.destination)
}

const playSound = (type) => {
  if (!sfxEnabled.value) return
  initAudio()
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  const now = audioCtx.currentTime

  osc.connect(gain)
  gain.connect(masterGain)

  if (type === 'merge') {
    // 普通合并音效：上升的音调
    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, now)
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15)
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
    osc.start()
    osc.stop(now + 0.2)
  } else if (type === 'mergeBig') {
    // 大水果合并音效：更丰富的音调
    osc.type = 'sine'
    osc.frequency.setValueAtTime(523.25, now)
    osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.2)
    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3)
    osc.start()
    osc.stop(now + 0.3)

    // 添加和声
    const osc2 = audioCtx.createOscillator()
    const gain2 = audioCtx.createGain()
    osc2.connect(gain2)
    gain2.connect(masterGain)
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(659.25, now + 0.05)
    osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.25)
    gain2.gain.setValueAtTime(0.08, now + 0.05)
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35)
    osc2.start(now + 0.05)
    osc2.stop(now + 0.35)
  } else if (type === 'watermelon') {
    // 西瓜合并音效：胜利和弦
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const o = audioCtx.createOscillator()
      const g = audioCtx.createGain()
      o.connect(g)
      g.connect(masterGain)
      o.type = 'sine'
      o.frequency.value = freq
      g.gain.setValueAtTime(0.12, now + i * 0.08)
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.5)
      o.start(now + i * 0.08)
      o.stop(now + i * 0.08 + 0.5)
    })
  } else if (type === 'drop') {
    // 投放水果音效：短促的点击声
    osc.type = 'square'
    osc.frequency.setValueAtTime(200, now)
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.05)
    gain.gain.setValueAtTime(0.08, now)
    gain.gain.linearRampToValueAtTime(0, now + 0.05)
    osc.start()
    osc.stop(now + 0.05)
  }
}

const toggleSfx = () => {
  sfxEnabled.value = !sfxEnabled.value
}

const FRUIT_SCALE = 2
const FRUIT_ICON_SCALE = 1.6
const WATERMELON_IMAGE_SCALE = 2.6

const baseFruitTypes = [
  { id: 0, name: '水果0', emoji: '🍇', image: fruit00, r: 14, color: '#bf5af2', glow: 'rgba(191,90,242,.55)', score: 2 },
  { id: 1, name: '水果1', emoji: '🍒', image: fruit01, r: 18, color: '#ff2d55', glow: 'rgba(255,45,85,.55)', score: 4 },
  { id: 2, name: '水果2', emoji: '🍊', image: fruit02, r: 24, color: '#ff9f0a', glow: 'rgba(255,159,10,.55)', score: 8 },
  { id: 3, name: '水果3', emoji: '🍋', image: fruit03, r: 28, color: '#ffd60a', glow: 'rgba(255,214,10,.55)', score: 16 },
  { id: 4, name: '水果4', emoji: '🥝', image: fruit04, r: 32, color: '#32d74b', glow: 'rgba(50,215,75,.55)', score: 32 },
  { id: 5, name: '水果5', emoji: '🍎', image: fruit05, r: 36, color: '#ff6b3d', glow: 'rgba(255,107,61,.52)', score: 64 },
  { id: 6, name: '水果6', emoji: '🍑', image: fruit06, r: 42, color: '#ff6bcb', glow: 'rgba(255,107,203,.55)', score: 128 },
  { id: 7, name: '水果7', emoji: '🍍', image: fruit07, r: 50, color: '#ffd60a', glow: 'rgba(255,214,10,.45)', score: 256 },
  { id: 8, name: '水果8', emoji: '🥥', image: fruit08, r: 58, color: '#a2845e', glow: 'rgba(162,132,94,.45)', score: 512 },
  { id: 9, name: '水果9', emoji: '🍈', image: fruit09, r: 66, color: '#00ffa3', glow: 'rgba(0,255,163,.40)', score: 1024 },
  { id: 10, name: '水果10', emoji: '🍉', image: fruit10, r: 76, color: '#00c8ff', glow: 'rgba(0,200,255,.40)', score: 2048 },
  { id: 11, name: '水果11', emoji: '🍉', image: fruit11, r: 88, color: '#ff6bcb', glow: 'rgba(255,107,203,.40)', score: 4096 }
]

const fruitImages = {}
for (const f of baseFruitTypes) {
  if (!f.image) continue
  const img = new Image()
  img.src = f.image
  img.onload = () => {
    fruitImages[f.id] = img
  }
  fruitImages[f.id] = img
}

const fruitTypes = baseFruitTypes.map((f) => ({ ...f, r: f.r * FRUIT_SCALE }))

const maxLevel = fruitTypes.length - 1
const nextLevel = ref(randomNextLevel())

const boardSize = ref({ w: 720, h: 860 })
const dpr = computed(() => window.devicePixelRatio || 1)
const dropX = ref(360)

const dangerY = computed(() => 84)
const spawnY = computed(() => 54)

let ctx = null
let engine = null
let runner = null
let rafId = 0
let boundaries = null
let mergeQueue = []
let canDrop = true
let overLineMs = 0
let lastFrameTs = 0
let onResize = null
let onCollisionStart = null
let onAfterUpdate = null

function randomNextLevel() {
  // 经典玩法：下一颗多为小果（更"控"得住）
  const r = Math.random()
  if (r < 0.55) return 0
  if (r < 0.85) return 1
  return 2
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

// ===== 粒子系统 =====

// 创建合并粒子特效
function createMergeParticles(x, y, isWatermelon = false) {
  if (!hasPineapple.value) return // 只有解锁菠萝后才有粒子效果

  // 西瓜合并时放大特效
  const particleCount = isWatermelon
    ? 40 + Math.floor(Math.random() * 20)  // 西瓜：40-60个粒子
    : 15 + Math.floor(Math.random() * 10)  // 普通：15-25个粒子

  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.3
    const speed = isWatermelon
      ? 4 + Math.random() * 5  // 西瓜：速度更快 4-9
      : 2 + Math.random() * 3   // 普通：速度 2-5
    const size = isWatermelon
      ? 6 + Math.random() * 8   // 西瓜：粒子更大 6-14
      : 3 + Math.random() * 4   // 普通：粒子大小 3-7

    particles.value.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      life: 1.0, // 生命值 1.0 -> 0
      decay: isWatermelon
        ? 0.012 + Math.random() * 0.008  // 西瓜：衰减更慢，持续时间更长
        : 0.015 + Math.random() * 0.01   // 普通：正常衰减
    })
  }
}

// 更新粒子
function updateParticles() {
  particles.value = particles.value.filter(p => {
    // 更新位置
    p.x += p.vx
    p.y += p.vy
    // 添加重力
    p.vy += 0.12
    // 空气阻力
    p.vx *= 0.98
    p.vy *= 0.98
    // 衰减生命值
    p.life -= p.decay

    return p.life > 0
  })
}

// 绘制粒子
function drawParticles() {
  if (!hasPineapple.value || particles.value.length === 0) return

  ctx.save()
  for (const p of particles.value) {
    // 根据粒子大小判断是否是西瓜特效（西瓜粒子更大）
    const isLargeParticle = p.size > 7

    const alpha = p.life * 0.9
    ctx.globalAlpha = alpha

    // 西瓜粒子：更大的光晕和更亮的颜色
    if (isLargeParticle) {
      ctx.shadowColor = 'rgba(150, 250, 255, 1)'
      ctx.shadowBlur = p.size * 4  // 更大的光晕

      // 更亮的蓝色
      ctx.fillStyle = 'rgba(120, 250, 255, 1)'
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)

      // 更强的内部高光
      ctx.fillStyle = 'rgba(220, 255, 255, 1)'
      ctx.fillRect(p.x - p.size / 4, p.y - p.size / 4, p.size / 2, p.size / 2)
    } else {
      // 普通粒子
      ctx.shadowColor = 'rgba(100, 230, 255, 1)'
      ctx.shadowBlur = p.size * 3

      ctx.fillStyle = 'rgba(100, 240, 255, 1)'
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)

      ctx.fillStyle = 'rgba(200, 250, 255, 0.8)'
      ctx.fillRect(p.x - p.size / 4, p.y - p.size / 4, p.size / 2, p.size / 2)
    }
  }
  ctx.restore()
}

// 创建边框像素粒子（用于椰子解锁后的边框效果）
const borderPixels = ref([])

function createBorderPixels() {
  if (!hasCoconut.value) return

  const { w, h } = boardSize.value
  const pad = 14
  const spacing = 16 // 粒子间距
  borderPixels.value = []

  // 创建两层粒子：外层和内层
  const layers = [
    { offset: 0, sizeMin: 10, sizeMax: 16 },      // 外层（在边框线上）
    { offset: -10, sizeMin: 4, sizeMax: 8 }           // 内层（向内偏移）
  ]

  for (const layer of layers) {
    // 上边
    for (let x = pad; x < w - pad; x += spacing) {
      if (Math.random() > 0.6) { // 不规则排布
        borderPixels.value.push({
          x: x + (Math.random() - 0.5) * 6,
          y: pad + layer.offset + (Math.random() - 0.5) * 4,
          size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
          phase: Math.random() * Math.PI * 2,
          speed: 0.005
        })
      }
    }

    // 下边
    for (let x = pad; x < w - pad; x += spacing) {
      if (Math.random() > 0.6) {
        borderPixels.value.push({
          x: x + (Math.random() - 0.5) * 6,
          y: h - pad - layer.offset + (Math.random() - 0.5) * 4,
          size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
          phase: Math.random() * Math.PI * 2,
          speed: 0.005
        })
      }
    }

    // 左边
    for (let y = pad; y < h - pad; y += spacing) {
      if (Math.random() > 0.6) {
        borderPixels.value.push({
          x: pad + layer.offset + (Math.random() - 0.5) * 4,
          y: y + (Math.random() - 0.5) * 6,
          size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
          phase: Math.random() * Math.PI * 2,
          speed: 0.005
        })
      }
    }

    // 右边
    for (let y = pad; y < h - pad; y += spacing) {
      if (Math.random() > 0.6) {
        borderPixels.value.push({
          x: w - pad - layer.offset + (Math.random() - 0.5) * 4,
          y: y + (Math.random() - 0.5) * 6,
          size: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
          phase: Math.random() * Math.PI * 2,
          speed: 0.005
        })
      }
    }
  }
}

// 绘制边框像素粒子
function drawBorderPixels(ts) {
  if (!hasCoconut.value || borderPixels.value.length === 0) return

  ctx.save()
  for (const p of borderPixels.value) {
    // 闪烁效果
    const flicker = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(ts * p.speed + p.phase))
    ctx.globalAlpha = flicker

    // 蓝色像素光晕
    ctx.shadowColor = 'rgba(100, 230, 255, 1)'
    ctx.shadowBlur = p.size * 4

    // 方形蓝色像素
    ctx.fillStyle = 'rgba(150, 240, 255, 1)'
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)

    // 内部高光（小方块）
    ctx.fillStyle = 'rgba(200, 250, 255, 0.9)'
    const innerSize = p.size * 0.5
    ctx.fillRect(p.x - innerSize / 2, p.y - innerSize / 2, innerSize, innerSize)
  }
  ctx.restore()
}

// 检查并更新特效解锁状态
function checkEffectUnlocks() {
  const bodies = Composite.allBodies(engine.world)
  let foundPineapple = false
  let foundCoconut = false

  for (const b of bodies) {
    if (b.label !== 'fruit') continue
    const level = b.plugin?.level
    if (level === 7) foundPineapple = true
    if (level === 8) foundCoconut = true
  }

  // 首次解锁菠萝
  if (!hasPineapple.value && foundPineapple) {
    hasPineapple.value = true
  }

  // 首次解锁椰子
  if (!hasCoconut.value && foundCoconut) {
    hasCoconut.value = true
    createBorderPixels() // 立即生成边框粒子
  }
}

function initCanvas() {
  if (!canvasRef.value || !boardRef.value) return
  const rect = boardRef.value.getBoundingClientRect()
  const w = Math.max(360, Math.floor(rect.width))
  const h = Math.max(520, Math.floor(rect.height))
  boardSize.value = { w, h }
  const canvas = canvasRef.value
  const scale = dpr.value
  canvas.width = Math.floor(w * scale)
  canvas.height = Math.floor(h * scale)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx = canvas.getContext('2d')
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
}

function initPhysics() {
  engine = Engine.create({
    gravity: { x: 0, y: 1.1 }
  })
  engine.world.gravity.scale = 0.0012

  runner = Runner.create()

  createBoundaries()

  // 合并判定：碰撞开始时打标，afterUpdate 统一处理，避免多次合并抖动
  onCollisionStart = (evt) => {
    if (phase.value !== 'playing') return
    for (const pair of evt.pairs) {
      const a = pair.bodyA
      const b = pair.bodyB
      if (a.label !== 'fruit' || b.label !== 'fruit') continue
      const la = a.plugin?.level
      const lb = b.plugin?.level
      if (la == null || lb == null) continue
      if (la !== lb) continue
      if (la >= maxLevel) continue
      if (a.plugin?.merging || b.plugin?.merging) continue

      a.plugin.merging = true
      b.plugin.merging = true
      mergeQueue.push({
        aId: a.id,
        bId: b.id,
        level: la,
        x: (a.position.x + b.position.x) / 2,
        y: (a.position.y + b.position.y) / 2
      })
    }
  }
  Events.on(engine, 'collisionStart', onCollisionStart)

  onAfterUpdate = () => {
    if (phase.value !== 'playing') return
    if (mergeQueue.length) processMergeQueue()
    checkGameOver()
    checkEffectUnlocks() // 检查特效解锁
    updateParticles() // 更新粒子
  }
  Events.on(engine, 'afterUpdate', onAfterUpdate)
}

function createBoundaries() {
  const { w, h } = boardSize.value
  const t = 80

  if (boundaries) {
    World.remove(engine.world, boundaries.floor)
    World.remove(engine.world, boundaries.left)
    World.remove(engine.world, boundaries.right)
  }

  const floor = Bodies.rectangle(w / 2, h + t / 2, w + t * 2, t, {
    isStatic: true,
    restitution: 0.1,
    friction: 0.2,
    label: 'wall'
  })
  const left = Bodies.rectangle(-t / 2, h / 2, t, h * 2, { isStatic: true, label: 'wall' })
  const right = Bodies.rectangle(w + t / 2, h / 2, t, h * 2, { isStatic: true, label: 'wall' })

  boundaries = { floor, left, right }
  World.add(engine.world, [floor, left, right])
}

function clearFruits() {
  const bodies = Composite.allBodies(engine.world)
  for (const b of bodies) {
    if (b.label === 'fruit') World.remove(engine.world, b)
  }
}

function fruitBody(level, x, y) {
  const f = fruitTypes[level]
  const body = Bodies.circle(x, y, f.r, {
    restitution: 0.05,
    friction: 0.08,
    frictionAir: 0.01,
    density: 0.0022,
    slop: 0.02,
    label: 'fruit',
    render: { visible: false }
  })
  body.plugin = { level, merging: false }
  return body
}

function dropFruit() {
  if (phase.value !== 'playing') return
  if (!canDrop) return
  canDrop = false
  window.setTimeout(() => { canDrop = true }, 260)

  // 播放投放音效
  playSound('drop')

  const { w } = boardSize.value
  const level = nextLevel.value
  const r = fruitTypes[level].r
  const x = clamp(dropX.value, r + 16, w - r - 16)
  const body = fruitBody(level, x, spawnY.value)
  World.add(engine.world, body)
  nextLevel.value = randomNextLevel()
}

function processMergeQueue() {
  const world = engine.world
  const todo = mergeQueue
  mergeQueue = []

  for (const item of todo) {
    const a = Composite.get(world, item.aId, 'body')
    const b = Composite.get(world, item.bId, 'body')
    if (!a || !b) continue

    const level = item.level
    if (level >= maxLevel) {
      if (a.plugin) a.plugin.merging = false
      if (b.plugin) b.plugin.merging = false
      continue
    }

    World.remove(world, a)
    World.remove(world, b)

    const newLevel = level + 1
    const nb = fruitBody(newLevel, item.x, item.y)
    World.add(world, nb)
    Body.applyForce(nb, nb.position, { x: (Math.random() - 0.5) * 0.0012, y: -0.0016 })

    // 播放合并音效
    if (newLevel === 9) {
      // 西瓜合并：特殊胜利音效
      playSound('watermelon')
    } else if (newLevel >= 6) {
      // 大水果合并（桃子、菠萝、椰子）：更丰富的音效
      playSound('mergeBig')
    } else {
      // 普通合并：基础音效
      playSound('merge')
    }

    // 创建合并粒子特效（菠萝解锁后）
    // 如果是合并出西瓜（level 9），放大粒子特效
    const isWatermelon = newLevel === 9
    createMergeParticles(item.x, item.y, isWatermelon)

    score.value += fruitTypes[newLevel].score
    if (score.value > bestScore.value) {
      bestScore.value = score.value
      localStorage.setItem('watermelonMerge:bestScore', String(bestScore.value))
    }
  }
}

function checkGameOver() {
  const bodies = Composite.allBodies(engine.world)
  const dt = 16
  let danger = false

  for (const b of bodies) {
    if (b.label !== 'fruit') continue
    const level = b.plugin?.level ?? 0
    const r = fruitTypes[level]?.r ?? 10
    const top = b.position.y - r
    if (top < dangerY.value && b.speed < 1.2) {
      danger = true
      break
    }
  }

  if (danger) overLineMs += dt
  else overLineMs = Math.max(0, overLineMs - dt * 2)

  if (overLineMs > 1600) {
    gameOver()
  }
}

function gameOver() {
  if (phase.value === 'gameover') return
  phase.value = 'gameover'
  overLineMs = 0
  if (runner) Runner.stop(runner)
}

function startGame() {
  score.value = 0
  nextLevel.value = randomNextLevel()
  overLineMs = 0
  clearFruits()

  // 重置特效状态
  hasPineapple.value = false
  hasCoconut.value = false
  particles.value = []
  borderPixels.value = []

  phase.value = 'playing'
  Runner.run(runner, engine)
  setTimeout(() => stageRef.value?.focus(), 50)
}

function restart() {
  score.value = 0
  nextLevel.value = randomNextLevel()
  overLineMs = 0
  clearFruits()

  // 重置特效状态
  hasPineapple.value = false
  hasCoconut.value = false
  particles.value = []
  borderPixels.value = []


  if (phase.value === 'paused') {
    phase.value = 'playing'
    Runner.run(runner, engine)
  }
  if (phase.value === 'gameover') {
    phase.value = 'playing'
    Runner.run(runner, engine)
  }
}

function restartAndPlay() {
  restart()
  phase.value = 'playing'
  Runner.run(runner, engine)
  setTimeout(() => stageRef.value?.focus(), 50)
}

function togglePause() {
  if (phase.value !== 'playing' && phase.value !== 'paused') return
  if (phase.value === 'playing') {
    phase.value = 'paused'
    Runner.stop(runner)
  } else {
    phase.value = 'playing'
    Runner.run(runner, engine)
    setTimeout(() => stageRef.value?.focus(), 50)
  }
}

function handleReturnClick() {
  cleanup()
  returnToPrevious()
}

function handleKeyDown(e) {
  if (e.code === 'Space') {
    e.preventDefault()
    if (phase.value === 'playing') dropFruit()
    return
  }
  if (e.code === 'KeyP') {
    e.preventDefault()
    togglePause()
  }
}

function handlePointerMove(clientX) {
  const el = boardRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = clientX - rect.left
  const { w } = boardSize.value
  const r = fruitTypes[nextLevel.value]?.r ?? 18
  dropX.value = clamp(x, r + 16, w - r - 16)
}

function onPointerMove(e) {
  if (!e) return
  if (e.touches?.length) handlePointerMove(e.touches[0].clientX)
  else handlePointerMove(e.clientX)
}

function onPointerDown(e) {
  if (phase.value !== 'playing') return
  if (e?.button != null && e.button !== 0) return
  dropFruit()
}

function draw(ts) {
  rafId = requestAnimationFrame(draw)
  if (!ctx || !engine) return

  const { w, h } = boardSize.value
  const dt = ts && lastFrameTs ? Math.min(48, ts - lastFrameTs) : 16
  lastFrameTs = ts || lastFrameTs

  // 背景留给CSS，这里只画游戏框与实体
  ctx.clearRect(0, 0, w, h)

  // 场地框
  const pad = 14
  ctx.save()
  ctx.globalAlpha = 0.9
  ctx.strokeStyle = 'rgba(0,255,255,.35)'
  ctx.lineWidth = 2
  ctx.shadowColor = 'rgba(0,255,255,.45)'
  ctx.shadowBlur = 14
  roundRect(ctx, pad, pad, w - pad * 2, h - pad * 2, 18)
  ctx.stroke()
  ctx.restore()

  // 绘制边框像素粒子（椰子解锁后）
  drawBorderPixels(ts || 0)

  // 危险线
  ctx.save()
  ctx.setLineDash([10, 10])
  ctx.strokeStyle = 'rgba(255,45,85,.55)'
  ctx.lineWidth = 2
  ctx.shadowColor = 'rgba(255,45,85,.45)'
  ctx.shadowBlur = 10
  ctx.beginPath()
  ctx.moveTo(pad + 8, dangerY.value)
  ctx.lineTo(w - pad - 8, dangerY.value)
  ctx.stroke()
  ctx.restore()

  // 预览“幽灵”果子
  if (phase.value === 'playing') {
    const lvl = nextLevel.value
    const f = fruitTypes[lvl]
    const x = clamp(dropX.value, f.r + 16, w - f.r - 16)
    drawFruitGhost(x, spawnY.value, lvl)
  }

  // 画水果
  const bodies = Composite.allBodies(engine.world)
  for (const b of bodies) {
    if (b.label !== 'fruit') continue
    const level = b.plugin?.level ?? 0
    drawFruit(b, level)
  }

  // 绘制粒子特效（菠萝解锁后）
  drawParticles()

  // 轻微"危险闪烁"
  if (overLineMs > 0 && phase.value === 'playing') {
    ctx.save()
    ctx.globalAlpha = Math.min(0.22, overLineMs / 1600 * 0.22) * (0.7 + 0.3 * Math.sin((ts || 0) / 80))
    ctx.fillStyle = 'rgba(255,45,85,.45)'
    ctx.fillRect(0, 0, w, dangerY.value + 6)
    ctx.restore()
  }

  // 简单节流：避免长时间无渲染导致dt爆炸
  if (dt > 40) lastFrameTs = ts
}

function drawFruit(body, level) {
  const f = fruitTypes[level]
  const x = body.position.x
  const y = body.position.y
  const r = f.r

  ctx.save()

  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r)
  g.addColorStop(0, 'rgba(255,255,255,0.22)')
  g.addColorStop(0.45, 'rgba(40,48,80,0.9)')
  g.addColorStop(1, 'rgba(5,8,20,1)')

  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()

  const img = fruitImages[level]
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r * 0.82, 0, Math.PI * 2)
    ctx.clip()

    ctx.translate(x, y)
    ctx.rotate(body.angle)

    const iconSize = r * 1.6
    ctx.drawImage(img, -iconSize / 2, -iconSize / 2, iconSize, iconSize)
    ctx.restore()
  } else {
    ctx.translate(x, y)
    ctx.rotate(body.angle)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${Math.max(12, Math.round(f.r * 0.9 * FRUIT_ICON_SCALE))}px ui-sans-serif, system-ui, "Segoe UI Emoji"`
    ctx.fillStyle = 'rgba(255,255,255,.92)'
    ctx.fillText(f.emoji, 0, 4)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(255,255,255,0.36)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, r - 1, 0, Math.PI * 2)
  ctx.stroke()

  ctx.save()
  const highlightR = r * 0.5
  const hx = x - r * 0.22
  const hy = y - r * 0.32
  const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, highlightR)
  hg.addColorStop(0, 'rgba(255,255,255,0.55)')
  hg.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hg
  ctx.beginPath()
  ctx.ellipse(hx, hy, highlightR * 0.5, highlightR * 0.28, -0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  ctx.restore()
}

function drawFruitGhost(x, y, level) {
  const f = fruitTypes[level]
  if (!f) return

  ctx.save()
  const r = f.r
  ctx.globalAlpha = 0.58

  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r)
  g.addColorStop(0, 'rgba(255,255,255,0.26)')
  g.addColorStop(0.45, 'rgba(40,48,80,0.8)')
  g.addColorStop(1, 'rgba(5,8,20,0.95)')

  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()

  ctx.shadowBlur = 0
  ctx.setLineDash([6, 6])
  ctx.strokeStyle = 'rgba(255,255,255,.42)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, r - 1, 0, Math.PI * 2)
  ctx.stroke()

  ctx.setLineDash([])

  const img = fruitImages[level]
  if (img && img.complete && img.naturalWidth > 0) {
    const iconSize = r * 1.6
    ctx.globalAlpha = 0.58
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r * 0.82, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, x - iconSize / 2, y - iconSize / 2, iconSize, iconSize)
    ctx.restore()
  } else {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${Math.max(12, Math.round(f.r * 0.9 * FRUIT_ICON_SCALE))}px ui-sans-serif, system-ui, "Segoe UI Emoji"`
    ctx.fillStyle = 'rgba(255,255,255,.92)'
    ctx.fillText(f.emoji, x, y + 1)
  }

  ctx.restore()
}

function roundRect(c, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  c.beginPath()
  c.moveTo(x + rr, y)
  c.arcTo(x + w, y, x + w, y + h, rr)
  c.arcTo(x + w, y + h, x, y + h, rr)
  c.arcTo(x, y + h, x, y, rr)
  c.arcTo(x, y, x + w, y, rr)
  c.closePath()
}

function cleanup() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0

  try {
    if (runner) Runner.stop(runner)
  } catch (e) {}

  try {
    if (engine) {
      if (onCollisionStart) Events.off(engine, 'collisionStart', onCollisionStart)
      if (onAfterUpdate) Events.off(engine, 'afterUpdate', onAfterUpdate)
      Engine.clear(engine)
    }
  } catch (e) {}

  try {
    if (audioCtx) {
      audioCtx.close()
    }
  } catch (e) {}

  ctx = null
  engine = null
  runner = null
  boundaries = null
  mergeQueue = []
  onCollisionStart = null
  onAfterUpdate = null
  audioCtx = null
  masterGain = null
}

onMounted(() => {
  initCanvas()
  initPhysics()

  onResize = () => {
    initCanvas()
    if (!engine) return
    createBoundaries()
    // 重新生成边框粒子（如果已解锁椰子）
    if (hasCoconut.value) {
      createBorderPixels()
    }
  }

  window.addEventListener('resize', onResize)

  const el = boardRef.value
  el?.addEventListener('mousemove', onPointerMove, { passive: true })
  el?.addEventListener('touchmove', onPointerMove, { passive: true })
  el?.addEventListener('mousedown', onPointerDown, { passive: true })
  el?.addEventListener('touchend', onPointerDown, { passive: true })

  rafId = requestAnimationFrame(draw)
  setTimeout(() => stageRef.value?.focus(), 50)
})

onUnmounted(() => {
  if (onResize) window.removeEventListener('resize', onResize)
  const el = boardRef.value
  el?.removeEventListener('mousemove', onPointerMove)
  el?.removeEventListener('touchmove', onPointerMove)
  el?.removeEventListener('mousedown', onPointerDown)
  el?.removeEventListener('touchend', onPointerDown)
  cleanup()
})
</script>

<style scoped>
.wm-root {
  position: relative;
  min-height: 100vh;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: radial-gradient(1200px 800px at 10% 10%, rgba(0, 255, 255, 0.14), transparent 60%),
    radial-gradient(900px 600px at 90% 20%, rgba(191, 90, 242, 0.16), transparent 60%),
    radial-gradient(900px 900px at 50% 100%, rgba(0, 255, 163, 0.10), transparent 65%),
    linear-gradient(180deg, #070813 0%, #060615 40%, #050512 100%);
  color: rgba(255, 255, 255, 0.92);
  overflow: hidden;
}

.wm-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.wm-grid {
  position: absolute;
  inset: -20% -20%;
  background-image:
    linear-gradient(rgba(0, 255, 255, 0.10) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 255, 255, 0.10) 1px, transparent 1px);
  background-size: 64px 64px;
  transform: perspective(900px) rotateX(60deg) translateY(22%);
  filter: drop-shadow(0 0 16px rgba(0, 255, 255, 0.10));
  opacity: 0.55;
  animation: wmGridFloat 10s ease-in-out infinite;
}

.wm-scanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.03),
    rgba(255, 255, 255, 0.03) 1px,
    transparent 1px,
    transparent 4px
  );
  mix-blend-mode: overlay;
  opacity: 0.22;
}

.wm-glow-orb {
  position: absolute;
  width: 520px;
  height: 520px;
  left: -120px;
  top: 120px;
  border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, rgba(0,255,255,0.24), transparent 55%),
    radial-gradient(circle at 60% 40%, rgba(191,90,242,0.18), transparent 60%),
    radial-gradient(circle at 50% 50%, rgba(0,255,163,0.12), transparent 70%);
  filter: blur(10px);
  animation: wmOrb 8s ease-in-out infinite;
  opacity: 0.75;
}

.wm-top-ui {
  position: absolute;
  top: 14px;
  left: 16px;
  right: 16px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.wm-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(0, 255, 255, 0.07);
  border: 1px solid rgba(0, 255, 255, 0.16);
  box-shadow:
    0 0 0 1px rgba(191, 90, 242, 0.08) inset,
    0 0 20px rgba(0, 255, 255, 0.12),
    0 0 18px rgba(191, 90, 242, 0.08);
  position: relative;
  overflow: hidden;
  animation: wmTitlePulse 3.2s ease-in-out infinite;
}

.wm-title::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to right,
    rgba(255, 255, 255, 0.12) 0,
    rgba(255, 255, 255, 0.12) 1px,
    transparent 1px,
    transparent 12px
  );
  opacity: 0.08;
  mix-blend-mode: overlay;
}

.wm-emoji {
  font-size: 18px;
}

.wm-title-text {
  font-weight: 800;
  letter-spacing: 0.8px;
}

.wm-top-left {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.wm-top-right {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.wm-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 0 16px rgba(0, 255, 255, 0.06),
    0 0 14px rgba(191, 90, 242, 0.04);
  position: relative;
  overflow: hidden;
}

.wm-chip::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.10) 0,
    rgba(255, 255, 255, 0.10) 1px,
    transparent 1px,
    transparent 8px
  );
  opacity: 0.06;
  mix-blend-mode: overlay;
}

.wm-chip .k {
  font-size: 12px;
  opacity: 0.75;
}

.wm-chip .v {
  font-weight: 800;
  letter-spacing: 0.6px;
}

.wm-btn {
  cursor: pointer;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.92);
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
  position: relative;
  overflow: hidden;
}

.wm-btn--cyber {
  border-color: rgba(0, 255, 255, 0.28);
  background: linear-gradient(135deg, rgba(0, 255, 255, 0.12), rgba(191, 90, 242, 0.12));
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.06) inset,
    0 0 20px rgba(0, 255, 255, 0.12),
    0 0 18px rgba(191, 90, 242, 0.08);
}

.wm-btn--cyber::before {
  content: "";
  position: absolute;
  inset: -40%;
  background: radial-gradient(circle at 30% 30%, rgba(0, 255, 255, 0.48), transparent 55%),
    radial-gradient(circle at 70% 60%, rgba(191, 90, 242, 0.42), transparent 60%);
  filter: blur(18px);
  opacity: 0.0;
  transition: opacity 140ms ease;
  pointer-events: none;
}

.wm-btn--cyber::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.10) 0,
    rgba(255, 255, 255, 0.10) 1px,
    transparent 1px,
    transparent 8px
  );
  opacity: 0.0;
  transition: opacity 140ms ease;
  mix-blend-mode: overlay;
}

.wm-btn:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(0, 255, 255, 0.22);
}

.wm-btn--cyber:hover {
  border-color: rgba(0, 255, 255, 0.52);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 0 26px rgba(0, 255, 255, 0.18),
    0 0 24px rgba(191, 90, 242, 0.14);
  filter: saturate(1.08);
}

.wm-btn--cyber:hover::before {
  opacity: 0.68;
}

.wm-btn--cyber:hover::after {
  opacity: 0.12;
}

.wm-btn--cyber:active {
  transform: translateY(0);
  filter: saturate(1.14) brightness(1.08);
}

.wm-btn--cyber:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 0 0 2px rgba(0, 255, 255, 0.28),
    0 0 28px rgba(0, 255, 255, 0.22),
    0 0 24px rgba(191, 90, 242, 0.16);
}

.wm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.wm-exit {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-color: rgba(255, 45, 85, 0.22);
}

.wm-exit.wm-btn--cyber {
  border-color: rgba(255, 45, 85, 0.32);
  background: linear-gradient(135deg, rgba(255, 45, 85, 0.12), rgba(191, 90, 242, 0.12));
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.06) inset,
    0 0 20px rgba(255, 45, 85, 0.12),
    0 0 18px rgba(191, 90, 242, 0.08);
}

.wm-exit.wm-btn--cyber:hover {
  border-color: rgba(255, 45, 85, 0.52);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 0 26px rgba(255, 45, 85, 0.18),
    0 0 24px rgba(191, 90, 242, 0.14);
}

.wm-exit-icon {
  width: 18px;
  height: 18px;
  /* 把 SVG 染成赛博红（霓虹粉红）并加发光 */
  filter:
    brightness(0) saturate(100%)
    invert(44%) sepia(100%) saturate(3500%) hue-rotate(340deg) brightness(110%) contrast(105%)
    drop-shadow(0 0 8px rgba(255, 45, 85, 0.45))
    drop-shadow(0 0 12px rgba(255, 45, 85, 0.28));
}

.wm-stage {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  /* 顶部不再有导航栏占位，减少内边距以拉高游戏区域 */
  --wm-stage-pt: 10px;
  --wm-stage-pb: 12px;
  padding: var(--wm-stage-pt) 14px var(--wm-stage-pb);
}

.wm-board {
  width: min(720px, calc(100vw - 28px));
  /* 关键：扣掉 stage 的上下 padding，避免 100% + padding 导致高度溢出/裁切 */
  height: calc(100% - var(--wm-stage-pt) - var(--wm-stage-pb));
  max-height: calc(100% - var(--wm-stage-pt) - var(--wm-stage-pb));
  border-radius: 22px;
  position: relative;
  overflow: hidden;
  background: rgba(6, 7, 18, 0.42);
  border: 1px solid rgba(0, 255, 255, 0.14);
  box-shadow:
    0 18px 60px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(191, 90, 242, 0.08) inset;
}

.wm-board::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 2px;
  pointer-events: none;
  background: linear-gradient(
    135deg,
    rgba(0, 255, 255, 0.75),
    rgba(191, 90, 242, 0.55),
    rgba(255, 45, 85, 0.38)
  );
  opacity: 0.9;
  /* 渐变霓虹描边（兼容性不足时退化为轻微渐变覆层，也可接受） */
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  filter: drop-shadow(0 0 12px rgba(0, 255, 255, 0.18))
    drop-shadow(0 0 14px rgba(191, 90, 242, 0.14));
  animation: wmFramePulse 3.6s ease-in-out infinite;
}

.wm-board::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background:
    /* 扫描线 */
    repeating-linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.08) 0,
      rgba(255, 255, 255, 0.08) 1px,
      transparent 1px,
      transparent 8px
    ),
    /* 角标高光 */
    linear-gradient(90deg, rgba(0, 255, 255, 0.0), rgba(0, 255, 255, 0.10), rgba(0, 255, 255, 0.0)),
    /* 边缘暗角 */
    radial-gradient(circle at 50% 20%, rgba(0, 255, 255, 0.07), transparent 55%),
    radial-gradient(circle at 20% 80%, rgba(191, 90, 242, 0.06), transparent 60%),
    radial-gradient(circle at 80% 82%, rgba(255, 45, 85, 0.05), transparent 62%);
  opacity: 0.10;
  mix-blend-mode: overlay;
}

.wm-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.wm-hud {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 10px;
  pointer-events: none;
}

.wm-hud-row {
  display: flex;
  justify-content: center;
}

.wm-hud-tip {
  pointer-events: none;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.10);
  font-size: 12px;
  letter-spacing: 0.3px;
  opacity: 0.92;
}

.wm-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
}

.wm-modal {
  width: min(520px, calc(100vw - 44px));
  padding: 18px 18px 16px;
  border-radius: 18px;
  background: rgba(10, 12, 28, 0.72);
  border: 1px solid rgba(0, 255, 255, 0.16);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.65);
  text-align: center;
  position: relative;
  overflow: hidden;
  box-shadow:
    0 18px 60px rgba(0, 0, 0, 0.65),
    0 0 0 1px rgba(0, 255, 255, 0.08) inset,
    0 0 26px rgba(0, 255, 255, 0.10),
    0 0 30px rgba(191, 90, 242, 0.08);
}

.wm-modal::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    135deg,
    rgba(0, 255, 255, 0.70),
    rgba(191, 90, 242, 0.55),
    rgba(255, 45, 85, 0.42)
  );
  pointer-events: none;
  opacity: 0.9;
  /* 只显示“边框”区域：兼容性不足时会退化为轻微彩色蒙层（仍可接受） */
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
}

.wm-modal::after {
  content: "";
  position: absolute;
  inset: -20%;
  border-radius: inherit;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0.08) 0,
    rgba(255, 255, 255, 0.08) 1px,
    transparent 1px,
    transparent 7px
  );
  opacity: 0.08;
  mix-blend-mode: overlay;
  transform: rotate(-1deg);
}

.wm-modal-title {
  font-weight: 900;
  letter-spacing: 0.8px;
  font-size: 18px;
}

.wm-modal-title--cyber {
  font-size: 50px;
  letter-spacing: 4.2px;
  line-height: 1.15;
  margin-top: 16px;
  font-weight: 900;
  font-family: ui-sans-serif, system-ui, "Orbitron", "Rajdhani", "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
  background: linear-gradient(90deg, rgba(0, 255, 255, 0.98), rgba(191, 90, 242, 0.98), rgba(255, 45, 85, 0.98));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow:
    0 0 10px rgba(0, 255, 255, 0.22),
    0 0 18px rgba(191, 90, 242, 0.18),
    0 0 24px rgba(255, 45, 85, 0.12);
}

.wm-glitch {
  position: relative;
  display: inline-block;
}

.wm-glitch::before,
.wm-glitch::after {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  pointer-events: none;
  white-space: nowrap;
  /* 让伪元素不受父元素 transparent 影响 */
  -webkit-text-fill-color: currentColor;
}

.wm-glitch::before {
  color: rgba(0, 255, 255, 0.85);
  text-shadow:
    -2px 0 rgba(0, 255, 255, 0.35),
    2px 0 rgba(255, 45, 85, 0.25),
    0 0 18px rgba(0, 255, 255, 0.18);
  transform: translate(2px, -1px);
  clip-path: inset(0 0 58% 0);
  animation: wmGlitchTop 2.3s infinite steps(2, end);
  opacity: 0.9;
}

.wm-glitch::after {
  color: rgba(191, 90, 242, 0.80);
  text-shadow:
    2px 0 rgba(191, 90, 242, 0.35),
    -2px 0 rgba(0, 255, 255, 0.22),
    0 0 18px rgba(191, 90, 242, 0.16);
  transform: translate(-2px, 1px);
  clip-path: inset(62% 0 0 0);
  animation: wmGlitchBottom 2.9s infinite steps(2, end);
  opacity: 0.85;
}

@keyframes wmGlitchTop {
  0% { clip-path: inset(0 0 58% 0); transform: translate(2px, -1px); }
  12% { clip-path: inset(0 0 72% 0); transform: translate(3px, -2px); }
  18% { clip-path: inset(0 0 48% 0); transform: translate(1px, -1px); }
  26% { clip-path: inset(0 0 66% 0); transform: translate(4px, -1px); }
  34% { clip-path: inset(0 0 54% 0); transform: translate(2px, -3px); }
  48% { clip-path: inset(0 0 60% 0); transform: translate(3px, -1px); }
  60% { clip-path: inset(0 0 42% 0); transform: translate(1px, -2px); }
  76% { clip-path: inset(0 0 70% 0); transform: translate(4px, -1px); }
  100% { clip-path: inset(0 0 58% 0); transform: translate(2px, -1px); }
}

@keyframes wmGlitchBottom {
  0% { clip-path: inset(62% 0 0 0); transform: translate(-2px, 1px); }
  10% { clip-path: inset(76% 0 0 0); transform: translate(-3px, 2px); }
  22% { clip-path: inset(55% 0 0 0); transform: translate(-1px, 1px); }
  32% { clip-path: inset(68% 0 0 0); transform: translate(-4px, 2px); }
  44% { clip-path: inset(58% 0 0 0); transform: translate(-2px, 3px); }
  58% { clip-path: inset(72% 0 0 0); transform: translate(-3px, 1px); }
  74% { clip-path: inset(50% 0 0 0); transform: translate(-1px, 2px); }
  88% { clip-path: inset(66% 0 0 0); transform: translate(-4px, 1px); }
  100% { clip-path: inset(62% 0 0 0); transform: translate(-2px, 1px); }
}

@media (prefers-reduced-motion: reduce) {
  .wm-glitch::before,
  .wm-glitch::after {
    animation: none !important;
    opacity: 0.35;
    clip-path: none;
    transform: none;
  }
}

.wm-modal-sub {
  margin-top: 8px;
  opacity: 0.85;
  line-height: 1.55;
}

.wm-modal-sub--large {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 1.0px;
}

.wm-modal-rules {
  margin-top: 12px;
  display: grid;
  gap: 8px;
}

.wm-modal-rules--boxes {
  margin-top: 30px;
  gap: 10px;
  grid-template-columns: 1fr 1fr;
  align-items: stretch;
}

.wm-rule-box {
  --wm-accent: rgba(0, 255, 255, 0.95);
  --wm-border: rgba(0, 255, 255, 0.35);
  position: relative;
  padding: 20px 24px 28px;
  border-radius: 14px;
  border: 1px solid var(--wm-border);
  background: rgba(0, 0, 0, 0.18);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 0 22px rgba(0, 255, 255, 0.08);
  overflow: hidden;
}

.wm-rule-box,
.wm-rule-head,
.wm-rule-body {
  text-align: center;
}

.wm-rule-box::before {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  background:
    radial-gradient(circle at 18% 20%, rgba(0, 255, 255, 0.22), transparent 55%),
    radial-gradient(circle at 86% 72%, rgba(191, 90, 242, 0.18), transparent 60%);
  opacity: 0.9;
  filter: blur(10px);
}

.wm-rule-box--purple {
  --wm-accent: rgba(191, 90, 242, 0.98);
  --wm-border: rgba(191, 90, 242, 0.36);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 0 22px rgba(191, 90, 242, 0.10);
}

.wm-rule-head {
  position: relative;
  z-index: 1;
  font-weight: 900;
  font-size: 20px;
  letter-spacing: 1.4px;
  color: var(--wm-accent);
  text-shadow: 0 0 14px rgba(0, 0, 0, 0.35), 0 0 16px color-mix(in srgb, var(--wm-accent) 30%, transparent);
}

.wm-rule-body {
  position: relative;
  z-index: 1;
  margin-top: 6px;
  font-size: 16px;
  line-height: 1.55;
  letter-spacing: 1px;
  opacity: 0.92;
}

@media (max-width: 420px) {
  .wm-modal-rules--boxes {
    grid-template-columns: 1fr;
  }
}

.wm-rule .b {
  font-weight: 800;
  color: rgba(0, 255, 255, 0.95);
}

.wm-modal-actions {
  margin-top: 14px;
  display: flex;
  gap: 10px;
  justify-content: center;
}

.wm-modal-actions--equal {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  align-items: stretch;
}

.wm-modal-actions--equal .wm-primary {
  width: 100%;
  margin-top: 0;
  margin-bottom: 0;
}

@media (max-width: 420px) {
  .wm-modal-actions--equal {
    grid-template-columns: 1fr;
  }
}

.wm-primary {
  cursor: pointer;
  width: 100%;
  font-size: 20px;
  margin-top: 30px;
  margin-bottom: 20px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(0, 255, 255, 0.28);
  background: linear-gradient(90deg, rgba(0, 255, 255, 0.18), rgba(191, 90, 242, 0.18));
  color: rgba(255, 255, 255, 0.95);
  font-weight: 900;
  letter-spacing: 0.7px;
  position: relative;
  overflow: hidden;
}

.wm-primary-glow {
  position: absolute;
  inset: -40%;
  background: radial-gradient(circle at 30% 30%, rgba(0, 255, 255, 0.55), transparent 55%),
    radial-gradient(circle at 70% 60%, rgba(191, 90, 242, 0.45), transparent 60%);
  filter: blur(18px);
  opacity: 0.55;
  animation: wmBtnGlow 3.2s ease-in-out infinite;
}

.wm-primary:hover {
  border-color: rgba(0, 255, 255, 0.42);
}

.wm-fade-enter-active,
.wm-fade-leave-active {
  transition: opacity 160ms ease;
}
.wm-fade-enter-from,
.wm-fade-leave-to {
  opacity: 0;
}

@keyframes wmGridFloat {
  0%, 100% { transform: perspective(900px) rotateX(60deg) translateY(22%) translateX(0); opacity: 0.55; }
  50% { transform: perspective(900px) rotateX(60deg) translateY(24%) translateX(-20px); opacity: 0.65; }
}

@keyframes wmOrb {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(60px, -30px) scale(1.06); }
}

@keyframes wmBtnGlow {
  0%, 100% { transform: translateX(-6%) translateY(0) scale(1); opacity: 0.55; }
  50% { transform: translateX(6%) translateY(-2%) scale(1.02); opacity: 0.68; }
}

@keyframes wmFramePulse {
  0%, 100% { opacity: 0.82; filter: drop-shadow(0 0 10px rgba(0, 255, 255, 0.16)) drop-shadow(0 0 12px rgba(191, 90, 242, 0.12)); }
  50% { opacity: 0.98; filter: drop-shadow(0 0 16px rgba(0, 255, 255, 0.22)) drop-shadow(0 0 18px rgba(191, 90, 242, 0.16)); }
}

@keyframes wmTitlePulse {
  0%, 100% {
    box-shadow:
      0 0 0 1px rgba(191, 90, 242, 0.08) inset,
      0 0 16px rgba(0, 255, 255, 0.10),
      0 0 14px rgba(191, 90, 242, 0.06);
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(191, 90, 242, 0.12) inset,
      0 0 24px rgba(0, 255, 255, 0.16),
      0 0 20px rgba(191, 90, 242, 0.12);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wm-board::before,
  .wm-title {
    animation: none !important;
  }
}
</style>
