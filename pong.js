export async function readPongState(page) {
  return page.evaluate(() => {
    const pick = (sel, ctx = document) => ctx.querySelector(sel) || null
    const scoreMy = Number(
      (
        pick('span#playerScore') ||
        pick('div.player-score') ||
        pick('div.score.player') ||
        pick('span.player-score')
      ).textContent || 0
    )
    const scoreCpu = Number(
      (
        pick('span#cpuScore') ||
        pick('div.cpu-score') ||
        pick('div.score.cpu') ||
        pick('span.cpu-score')
      ).textContent || 0
    )
    const paddleEl =
      pick('div#paddle0') ||
      pick('div#playerPaddle') ||
      pick('.paddle.player') ||
      pick('div.paddle')
    const rect = paddleEl ? paddleEl.getBoundingClientRect() : null
    const paddleY = rect ? rect.top : 0
    const paddleH = rect ? rect.height : 100
    const ballEl = pick('div#ball') || pick('.ball') || pick('div.ball')
    const brect = ballEl ? ballEl.getBoundingClientRect() : null
    const ballY = brect ? brect.top : 0
    const ballX = brect ? brect.left : 0
    const ballR = brect ? Math.max(brect.width, brect.height) / 2 : 8
    const statusEl =
      pick('div#status') ||
      pick('.status') ||
      pick('h1') ||
      pick('h2') ||
      pick('div.overlay-text') ||
      pick('div.message') ||
      pick('div.status-text')
    const statusText = statusEl ? String(statusEl.textContent).trim() : ''
    const bodyText = document.body ? document.body.innerText || '' : ''
    const overlayVisible = pick('#modal-overlay')
      ? pick('#modal-overlay').classList.contains('visible')
      : false
    const won =
      /you won|you win|player wins/i.test(bodyText) ||
      (overlayVisible && /won|win/i.test(bodyText))
    const finished =
      /play again|restart|new game|game over|match over/i.test(statusText) || won
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
      statusText,
      bodyText
    }
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
    await page.keyboard.press(key)
    return 'keypress'
  } catch {
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
