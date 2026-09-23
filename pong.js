// AutoComplete Pong v1.2 — trace the real canvas drawing, predict the left-side impact, and target edge hits.

function scoreFromText(text, label) {
  const match = text.match(new RegExp(label + '\\s*\\n?\\s*(\\d+)', 'i'))
  return match ? Number(match[1]) : 0
}

function chooseCanvasShapes(trace, canvas) {
  const rects = Array.isArray(trace?.rects) ? trace.rects : []
  const arcs = Array.isArray(trace?.arcs) ? trace.arcs : []

  const paddle = rects
    .filter(r => r.x < canvas.width * 0.35 && r.w > 2 && r.h > r.w * 1.4 && r.h < canvas.height * 0.6)
    .sort((a, b) => (b.h * b.w) - (a.h * a.w))[0]

  const ballRects = rects
    .filter(r => r.w > 1 && r.h > 1 && r.w < canvas.width * 0.12 && r.h < canvas.height * 0.12)
    .sort((a, b) => (a.w * a.h) - (b.w * b.h))

  const ballArcs = arcs
    .filter(a => a.r > 1 && a.r < Math.min(canvas.width, canvas.height) * 0.08)
    .sort((a, b) => a.r - b.r)

  const ball = ballArcs[0]
    ? { x: ballArcs[0].x - ballArcs[0].r, y: ballArcs[0].y - ballArcs[0].r, w: ballArcs[0].r * 2, h: ballArcs[0].r * 2 }
    : ballRects[0]

  return { paddle, ball }
}

export async function readPongState(page) {
  return page.evaluate(() => {
    const scoreFromText = (text, label) => {
      const match = text.match(new RegExp(label + '\\\\s*\\\\n?\\\\s*(\\\\d+)', 'i'))
      return match ? Number(match[1]) : 0
    }
    const chooseCanvasShapes = (trace, canvas) => {
      const rects = Array.isArray(trace?.rects) ? trace.rects : []
      const arcs = Array.isArray(trace?.arcs) ? trace.arcs : []
      const paddle = rects.filter(r => r.x < canvas.width * 0.35 && r.w > 2 && r.h > r.w * 1.4 && r.h < canvas.height * 0.6).sort((a,b) => b.h*b.w - a.h*a.w)[0]
      const ballRects = rects.filter(r => r.w > 1 && r.h > 1 && r.w < canvas.width * 0.12 && r.h < canvas.height * 0.12).sort((a,b) => a.w*a.h - b.w*b.h)
      const ballArcs = arcs.filter(a => a.r > 1 && a.r < Math.min(canvas.width, canvas.height) * 0.08).sort((a,b) => a.r-b.r)
      const ball = ballArcs[0] ? { x: ballArcs[0].x-ballArcs[0].r, y: ballArcs[0].y-ballArcs[0].r, w: ballArcs[0].r*2, h: ballArcs[0].r*2 } : ballRects[0]
      return { paddle, ball }
    }
    const text = document.body?.innerText || ''
    const scoreMy = scoreFromText(text, 'You')
    const scoreCpu = scoreFromText(text, 'CPU')

    const canvas = [...document.querySelectorAll('canvas')]
      .filter(c => c.width > 200 && c.height > 100)
      .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]

    let paddleY = 0
    let paddleH = 80
    let ballX = 0
    let ballY = 0
    let ballR = 6
    let canvasDetected = false
    let canvasRect = null

    if (canvas) {
      const r = canvas.getBoundingClientRect()
      canvasRect = { left: r.left, top: r.top, width: r.width, height: r.height }

      const trace = window.__pongTrace?.last || null
      const shapes = chooseCanvasShapes(trace, canvas)

      if (shapes.paddle && shapes.ball) {
        const sx = r.width / canvas.width
        const sy = r.height / canvas.height
        paddleY = r.top + (shapes.paddle.y + shapes.paddle.h / 2) * sy
        paddleH = shapes.paddle.h * sy
        ballX = r.left + (shapes.ball.x + shapes.ball.w / 2) * sx
        ballY = r.top + (shapes.ball.y + shapes.ball.h / 2) * sy
        ballR = Math.max(shapes.ball.w * sx, shapes.ball.h * sy) / 2
        canvasDetected = true
      }
    }

    const won = /you won|you win|player wins/i.test(text)
    const finished = won || /play again|game over|match over/i.test(text)

    return {
      scoreMy,
      scoreCpu,
      paddleY,
      paddleH,
      ballX,
      ballY,
      ballR,
      won,
      finished,
      canvasDetected,
      canvasAvailable: Boolean(canvas),
      canvasRect,
      statusText: text.slice(0, 500)
    }
  })
}

export function pongGoalMet(state, goal) {
  return Boolean(state && (state.scoreMy >= goal || (state.finished && state.won)))
}

export function pongPolicy(difficulty = 'medium') {
  return {
    easy: { deadband: 5, lead: 0.30, edgeBias: 0.34 },
    medium: { deadband: 4, lead: 0.38, edgeBias: 0.40 },
    hard: { deadband: 3, lead: 0.46, edgeBias: 0.44 }
  }[difficulty] || { deadband: 4, lead: 0.38, edgeBias: 0.40 }
}

export function predictPongImpact(state, previous, difficulty = 'medium') {
  if (!state?.canvasRect || !Number.isFinite(state.ballX) || !Number.isFinite(state.ballY)) return null

  const policy = pongPolicy(difficulty)
  const board = state.canvasRect
  const leftX = board.left + Math.max(8, board.width * 0.055)
  const top = board.top
  const bottom = board.top + board.height

  let targetY = state.ballY

  if (
    previous &&
    Number.isFinite(previous.ballX) &&
    Number.isFinite(previous.ballY) &&
    previous.ballX !== state.ballX
  ) {
    const vx = state.ballX - previous.ballX
    const vy = state.ballY - previous.ballY

    // Only predict when the ball is travelling toward our left paddle.
    if (vx < -0.01) {
      const frames = Math.max(0, (state.ballX - leftX) / vx)
      targetY = state.ballY + vy * frames

      // Reflect the predicted point across the top/bottom walls.
      const margin = Math.max(state.ballR, 2)
      const minY = top + margin
      const maxY = bottom - margin
      const height = maxY - minY

      if (height > 0) {
        let normalized = (targetY - minY) % (height * 2)
        if (normalized < 0) normalized += height * 2
        targetY = normalized <= height
          ? minY + normalized
          : maxY - (normalized - height)
      }

      // Add a controlled edge bias. Hitting away from the paddle centre
      // creates a sharper return and is specifically how this game describes
      // its intended strategy.
      const direction = ((Math.floor((state.scoreMy + state.scoreCpu) * 1.7) % 2) === 0) ? -1 : 1
      targetY += direction * state.paddleH * policy.edgeBias
    }
  }

  const half = Math.max(8, state.paddleH / 2)
  return Math.max(top + half, Math.min(bottom - half, targetY))
}

export function shouldPaddleMove(state, targetY, difficulty = 'medium') {
  if (!state || state.finished || !Number.isFinite(targetY)) return { dir: null, reason: 'no-target' }
  const policy = pongPolicy(difficulty)
  const center = state.paddleY
  const diff = targetY - center
  if (Math.abs(diff) <= policy.deadband) return { dir: 'none', reason: 'aligned' }
  return { dir: diff > 0 ? 'down' : 'up', reason: 'intercept' }
}

export async function paddleMouseMove(page, state, targetY = null) {
  if (!state?.canvasRect) return false
  const r = state.canvasRect
  const y = Number.isFinite(targetY)
    ? Math.max(r.top + 3, Math.min(r.top + r.height - 3, targetY))
    : Math.max(r.top + 3, Math.min(r.top + r.height - 3, state.ballY))

  try {
    // vygam documents mouse movement/drag anywhere on the board as a control.
    // Put the pointer well inside the game canvas, not over the page header.
    await page.mouse.move(r.left + r.width * 0.50, y, { steps: 1 })
    return true
  } catch {
    return false
  }
}

export async function paddleKeyboardMove(page, direction) {
  if (!direction || direction === 'none') return false
  const key = direction === 'up' ? 'ArrowUp' : 'ArrowDown'
  try {
    await page.keyboard.down(key)
    await page.waitForTimeout(35)
    await page.keyboard.up(key)
    return true
  } catch {
    try { await page.keyboard.up(key) } catch {}
    return false
  }
}

export async function restartPongGame(page) {
  for (const selector of [
    'button:has-text("New game")',
    'button:has-text("New Game")',
    'button:has-text("Play Again")',
    'button:has-text("Restart")',
    'button.new-game',
    'button.restart',
    'button.play-again'
  ]) {
    try {
      const button = page.locator(selector).first()
      if (await button.isVisible({ timeout: 400 })) {
        await button.click({ timeout: 1000 })
        await page.waitForTimeout(250)
        return true
      }
    } catch {}
  }
  return false
}

export function pongUrlForDifficulty() {
  return 'https://vygam.com/pong'
}

export async function selectPongDifficulty(page, difficulty = 'medium') {
  const label = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase()
  for (const selector of [
    'button:has-text("' + label + '")',
    '[role="button"]:has-text("' + label + '")',
    'text=' + label
  ]) {
    try {
      const button = page.locator(selector).first()
      if (await button.isVisible({ timeout: 500 })) {
        await button.click({ timeout: 1000 })
        return true
      }
    } catch {}
  }
  return false
}

export async function startPongGame(page) {
  for (const selector of [
    'button:has-text("Start game")',
    'button:has-text("Start Game")',
    'button:has-text("Start")'
  ]) {
    try {
      const button = page.locator(selector).first()
      if (await button.isVisible({ timeout: 500 })) {
        await button.click({ timeout: 1000 })
        return true
      }
    } catch {}
  }
  return false
}
