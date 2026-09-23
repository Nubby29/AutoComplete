export async function readPongState(page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || ''

    const numberAfter = (label) => {
      const m = text.match(new RegExp(label + '\\s*\\n?\\s*(\\d+)', 'i'))
      return m ? Number(m[1]) : null
    }

    const scoreMy =
      numberAfter('You') ??
      Number((document.querySelector('#playerScore, .player-score, .score.player')?.textContent || '0').match(/\\d+/)?.[0] || 0)
    const scoreCpu =
      numberAfter('CPU') ??
      Number((document.querySelector('#cpuScore, .cpu-score, .score.cpu')?.textContent || '0').match(/\\d+/)?.[0] || 0)

    const all = [...document.querySelectorAll('*')]
    const findByName = (words) => all.find(el => {
      const n = ((el.id || '') + ' ' + (el.className || '')).toLowerCase()
      return words.some(w => n.includes(w))
    })

    let paddleEl =
      document.querySelector('#paddle0, #playerPaddle, .paddle.player, .player-paddle') ||
      findByName(['playerpaddle', 'paddle0', 'player-paddle'])
    let ballEl =
      document.querySelector('#ball, .ball') ||
      findByName(['ball'])

    let paddleRect = paddleEl?.getBoundingClientRect?.() || null
    let ballRect = ballEl?.getBoundingClientRect?.() || null

    // vygam's actual board is canvas-rendered. Prefer canvas coordinates when
    // available because generic DOM elements can be menu/overlay elements.
    // This prevents the controller from following a stale/non-game element.
    const hasGameCanvas = [...document.querySelectorAll('canvas')].some(c => c.width > 200 && c.height > 100)

    // vygam can render the actual game board in a canvas. If no DOM game
    // elements are exposed, inspect canvas pixels and identify the small ball
    // plus the two tall/narrow paddles by connected components.
    const canvas = [...document.querySelectorAll('canvas')]
      .filter(c => c.width > 200 && c.height > 100)
      .sort((a,b) => (b.width*b.height) - (a.width*a.height))[0]

    let canvasState = null
    if ((!paddleRect || !ballRect) && canvas) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        const w = canvas.width, h = canvas.height
        const data = ctx.getImageData(0, 0, w, h).data
        const step = Math.max(1, Math.floor(Math.min(w, h) / 180))
        const points = []
        let bg = [data[0], data[1], data[2]]
        for (let y = 0; y < h; y += step) {
          for (let x = 0; x < w; x += step) {
            const i = (y * w + x) * 4
            const a = data[i + 3]
            if (a < 180) continue
            const dr = Math.abs(data[i] - bg[0])
            const dg = Math.abs(data[i+1] - bg[1])
            const db = Math.abs(data[i+2] - bg[2])
            if (dr + dg + db > 70) points.push([x,y])
          }
        }
        const clusters = []
        const used = new Set()
        const key = (x,y) => x + ',' + y
        const set = new Set(points.map(([x,y]) => key(x,y)))
        for (const [sx,sy] of points) {
          const sk = key(sx,sy)
          if (used.has(sk)) continue
          const q=[[sx,sy]], comp=[]
          used.add(sk)
          while(q.length) {
            const [x,y]=q.pop(); comp.push([x,y])
            for (const [nx,ny] of [[x+step,y],[x-step,y],[x,y+step],[x,y-step]]) {
              const nk=key(nx,ny)
              if(nx>=0&&ny>=0&&nx<w&&ny<h&&set.has(nk)&&!used.has(nk)){
                used.add(nk); q.push([nx,ny])
              }
            }
          }
          if(comp.length >= 3){
            const xs=comp.map(p=>p[0]), ys=comp.map(p=>p[1])
            clusters.push({
              x:Math.min(...xs), y:Math.min(...ys),
              w:Math.max(...xs)-Math.min(...xs)+step,
              h:Math.max(...ys)-Math.min(...ys)+step,
              n:comp.length
            })
          }
        }
        const paddles = clusters
          .filter(o => o.h > o.w * 1.8 && o.h > h * 0.08)
          .sort((a,b)=>a.x-b.x)
        const balls = clusters
          .filter(o => o.w < w*0.12 && o.h < h*0.12 && o.w > 2 && o.h > 2)
          .sort((a,b)=>b.n-a.n)
        const left = paddles[0]
        const ball = balls[0]
        if(left && ball){
          const r=canvas.getBoundingClientRect()
          const sx=r.width/w, sy=r.height/h
          canvasState={
            paddleY:r.top+(left.y+left.h/2)*sy,
            paddleH:left.h*sy,
            ballX:r.left+(ball.x+ball.w/2)*sx,
            ballY:r.top+(ball.y+ball.h/2)*sy,
            ballR:Math.max(ball.w*sx,ball.h*sy)/2
          }
        }
      }
    }

    const paddleY = canvasState?.paddleY ?? (paddleRect ? paddleRect.top + paddleRect.height/2 : 0)
    const paddleH = canvasState?.paddleH ?? (paddleRect ? paddleRect.height : 100)
    const ballY = canvasState?.ballY ?? (ballRect ? ballRect.top + ballRect.height/2 : 0)
    const ballX = canvasState?.ballX ?? (ballRect ? ballRect.left + ballRect.width/2 : 0)
    const ballR = canvasState?.ballR ?? (ballRect ? Math.max(ballRect.width, ballRect.height)/2 : 8)

    const won = /you won|you win|player wins/i.test(text)
    const finished = won || /play again|game over|match over/i.test(text)
    return { scoreMy, scoreCpu, paddleY, paddleH, ballX, ballY, ballR, won, finished, statusText:text.slice(0,300), bodyText:text, canvasDetected: Boolean(canvasState), canvasAvailable: hasGameCanvas }
  })
}

export function pongGoalMet(state, goal) {
  if (!state) return false
  if (state.finished) return state.scoreMy >= goal || state.won
  return state.scoreMy >= goal
}

export function pongPolicy(difficulty = 'medium') {
  const map = {
    easy: { label: 'Pong / Easy', deadbandFactor: 0.14, maxLagPx: 220, moveThreshold: 6 },
    medium: { label: 'Pong / Medium', deadbandFactor: 0.08, maxLagPx: 160, moveThreshold: 4 },
    hard: { label: 'Pong / Hard', deadbandFactor: 0.05, maxLagPx: 110, moveThreshold: 2 }
  }
  return map[difficulty] || map.medium
}

export function shouldPaddleMove(state, lastY, difficulty = 'medium') {
  if (!state || state.finished) return { dir: null, reason: 'no-state' }
  const policy = pongPolicy(difficulty)
  if (state.scoreMy >= 7) return { dir: null, reason: 'goal-met' }
  const center = state.paddleY + state.paddleH / 2
  const target = state.ballY
  const deadband = Math.max(
    policy.moveThreshold,
    state.paddleH * policy.deadbandFactor
  )
  const diff = target - center
  const lag = Math.abs(diff)
  if (lag <= deadband) return { dir: 'none', reason: 'within-deadband' }
  if (lag > policy.maxLagPx)
    return { dir: diff > 0 ? 'down' : 'up', reason: 'chase-lag' }
  return { dir: diff > 0 ? 'down' : 'up', reason: 'track-ball' }
}

export async function paddleKeyboardMove(page, direction) {
  if (direction === 'none') return 'no-move'
  const key = direction === 'up' ? 'ArrowUp' : 'ArrowDown'
  try {
    // A short hold is more reliable than a single keypress for games that
    // move the paddle continuously while the arrow key is held.
    await page.keyboard.down(key)
    await page.waitForTimeout(35)
    await page.keyboard.up(key)
    return 'keypress'
  } catch {
    try { await page.keyboard.up(key) } catch {}
    return 'keypress-failed'
  }
}

export async function restartPongGame(page) {
  const selectors = [
    'button:has-text("New Game")',
    'button:has-text("Restart")',
    'button:has-text("Play Again")',
    'button:has-text("New game")',
    'button.new-game',
    'button.restart',
    'button.play-again',
    '.new-game',
    '.restart',
    '.play-again',
    'button[data-action="restart"]'
  ]
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first()
      if (await btn.isVisible({ timeout: 300 })) {
        await btn.click({ timeout: 400 })
        await page.waitForTimeout(200)
        return 'restart-click'
      }
    } catch {}
  }
  // Never click a random page coordinate as a restart fallback. On vygam,
  // the top-left area contains navigation and can leave /pong or open an external link.
  return 'restart-failed'
}

// AutoComplete Pong v1.1 — always opens the base Pong page and selects difficulty in-page.
export function pongUrlForDifficulty() {
  return 'https://vygam.com/pong'
}

export async function selectPongDifficulty(page, difficulty = 'medium') {
  const label = difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase()
  const selectors = [
    'button:has-text("' + label + '")',
    '[role="button"]:has-text("' + label + '")',
    'text=' + label
  ]
  for (const selector of selectors) {
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
  const selectors = [
    'button:has-text("Start game")',
    'button:has-text("Start Game")',
    'button:has-text("Start")',
    '[role="button"]:has-text("Start game")',
    '[role="button"]:has-text("Start Game")'
  ]
  for (const selector of selectors) {
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
