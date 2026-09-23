// AutoComplete Server v1.5 — Never click the Pong page header; keep automation on /pong.
import http from 'node:http'
import { createServer as createViteServer } from 'vite'
import { chromium } from 'playwright'
import { readPongState, pongGoalMet, shouldPaddleMove, paddleKeyboardMove, pongUrlForDifficulty, selectPongDifficulty, startPongGame, restartPongGame } from './pong.js'
import { readSolitaireState, chooseSolitaireAction, solitaireCardLabel, dragTableauCard, dragWasteCard, dragFoundationCard, solitaireSignature, listSolitaireMoves } from './solitaire.js'

const gameUrl = 'https://2048game.com/?ref=google-search-classic'
const minesweeperUrl = 'https://minesweeperonline.com/'
const sudokuUrl = 'https://www.nytimes.com/puzzles/sudoku?eafs_enabled=false'
const solitaireUrl = 'https://lkforge.com/games/solitaire/'
const browserPath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const arrows = { up: 'ArrowUp', right: 'ArrowRight', down: 'ArrowDown', left: 'ArrowLeft' }
const directions = ['up', 'right', 'down', 'left']
const cornerWeights = [65536, 32768, 16384, 8192, 512, 1024, 2048, 4096, 256, 128, 64, 32, 16, 8, 4, 2]
let session = { running: false, status: 'Awaiting start', moves: 0, best: 0, goal: 2048, rows: 4, columns: 4, board: Array(16).fill(0) }
let browser
let page
let loop
let game = '2048'
let pongLastY = null

function sendJson(response, data) {
  response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(data))
}

function parseBoard(tiles) {
  const next = Array(16).fill(0)
  for (const tile of tiles) {
    const value = Number(tile.match(/tile-(\d+)/)?.[1] || 0)
    const position = tile.match(/tile-position-(\d+)-(\d+)/)
    if (position) next[(Number(position[2]) - 1) * 4 + Number(position[1]) - 1] = value
  }
  return next
}

function slide(line) {
  const values = line.filter(Boolean)
  for (let index = 0; index < values.length - 1; index += 1) {
    if (values[index] === values[index + 1]) { values[index] *= 2; values.splice(index + 1, 1) }
  }
  while (values.length < 4) values.push(0)
  return values
}

function simulate(source, direction) {
  const next = Array(16).fill(0)
  for (let line = 0; line < 4; line += 1) {
    const indexes = direction === 'left' ? [0, 1, 2, 3].map((column) => line * 4 + column) : direction === 'right' ? [3, 2, 1, 0].map((column) => line * 4 + column) : direction === 'up' ? [0, 1, 2, 3].map((row) => row * 4 + line) : [3, 2, 1, 0].map((row) => row * 4 + line)
    const result = slide(indexes.map((index) => source[index]))
    indexes.forEach((index, position) => { next[index] = result[position] })
  }
  return next
}

function boardScore(board) {
  const empty = board.filter((value) => value === 0).length
  const logarithms = board.map((value) => value ? Math.log2(value) : 0)
  let smoothness = 0
  let monotonicity = 0
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const index = row * 4 + column
      if (column < 3) { smoothness -= Math.abs(logarithms[index] - logarithms[index + 1]); monotonicity += logarithms[index] >= logarithms[index + 1] ? logarithms[index] : -logarithms[index] }
      if (row < 3) { smoothness -= Math.abs(logarithms[index] - logarithms[index + 4]); monotonicity += logarithms[index] >= logarithms[index + 4] ? logarithms[index] : -logarithms[index] }
    }
  }
  const corner = board.reduce((total, value, index) => total + (value ? Math.log2(value) * cornerWeights[index] : 0), 0)
  return empty * 270 + smoothness * 18 + monotonicity * 8 + corner * 0.01 + Math.log2(Math.max(...board, 1)) * 12
}

function chooseMove(board) {
  const cache = new Map()
  function expectimax(state, depth, maximizing) {
    const key = `${depth}:${maximizing}:${state.join(',')}`
    if (cache.has(key)) return cache.get(key)
    if (depth === 0) return boardScore(state)
    if (maximizing) {
      const score = Math.max(...directions.map((direction) => {
        const next = simulate(state, direction)
        return next.some((value, index) => value !== state[index]) ? expectimax(next, depth - 1, false) : -Infinity
      }))
      cache.set(key, score)
      return score
    }
    const emptyIndexes = state.map((value, index) => value === 0 ? index : -1).filter((index) => index >= 0)
    if (!emptyIndexes.length) return boardScore(state)
    let total = 0
    for (const index of emptyIndexes) {
      const withTwo = [...state]; withTwo[index] = 2
      const withFour = [...state]; withFour[index] = 4
      total += (expectimax(withTwo, depth, true) * 0.9 + expectimax(withFour, depth, true) * 0.1) / emptyIndexes.length
    }
    cache.set(key, total)
    return total
  }
  return directions.map((direction) => {
    const next = simulate(board, direction)
    return { direction, score: next.some((value, index) => value !== board[index]) ? expectimax(next, 2, false) : -Infinity }
  }).sort((a, b) => b.score - a.score)[0].direction
}

async function readLiveBoard() {
  const tiles = await page.locator('.tile-container .tile').evaluateAll((elements) => elements.map((element) => element.className))
  return parseBoard(tiles)
}

async function readMinesweeperBoard() {
  const cells = await page.locator('div.square').evaluateAll((elements) => elements.map((element) => ({ id: element.id, className: element.className })))
  const playable = cells.map((cell) => {
    const [row, column] = cell.id.split('_').map(Number)
    const open = cell.className.match(/open([0-8])/)
    const flagged = cell.className.includes('flag')
    const lost = !flagged && /bomb|mine|death|lost|red/i.test(cell.className)
    return { row, column, state: open ? Number(open[1]) : flagged ? 'flag' : lost ? 'lost' : 'covered' }
  }).filter((cell) => Number.isInteger(cell.row) && cell.row > 0 && cell.row < 17 && Number.isInteger(cell.column) && cell.column > 0 && cell.column < 31)
  const rows = Math.max(...playable.map((cell) => cell.row))
  const columns = Math.max(...playable.map((cell) => cell.column))
  return { cells: playable, rows, columns, lost: playable.some((cell) => cell.state === 'lost') }
}

function neighbors(row, column, rows, columns) {
  const result = []
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
    if (!rowOffset && !columnOffset) continue
    const nextRow = row + rowOffset
    const nextColumn = column + columnOffset
    if (nextRow > 0 && nextRow <= rows && nextColumn > 0 && nextColumn <= columns) result.push(`${nextRow}_${nextColumn}`)
  }
  return result
}

function exactFrontierRisks(constraints) {
  const risks = new Map()
  const components = []
  const remainingConstraints = [...constraints]
  while (remainingConstraints.length) {
    const componentConstraints = [remainingConstraints.shift()]
    const variables = new Set(componentConstraints[0].cells)
    let changed = true
    while (changed) {
      changed = false
      for (let index = remainingConstraints.length - 1; index >= 0; index -= 1) {
        if (remainingConstraints[index].cells.some((cell) => variables.has(cell))) {
          const [constraint] = remainingConstraints.splice(index, 1)
          componentConstraints.push(constraint)
          constraint.cells.forEach((cell) => variables.add(cell))
          changed = true
        }
      }
    }
    components.push({ constraints: componentConstraints, variables: [...variables] })
  }
  for (const component of components) {
    if (component.variables.length > 22) continue
    const assignments = new Map()
    component.variables.forEach((variable) => assignments.set(variable, undefined))
    let solutions = 0
    const mineCounts = new Map(component.variables.map((variable) => [variable, 0]))
    function search(position) {
      if (solutions > 100000) return
      for (const constraint of component.constraints) {
        let assignedMines = 0
        let unassigned = 0
        for (const cell of constraint.cells) {
          if (assignments.get(cell) === 1) assignedMines += 1
          else if (assignments.get(cell) === undefined) unassigned += 1
        }
        if (assignedMines > constraint.remaining || assignedMines + unassigned < constraint.remaining) return
      }
      if (position === component.variables.length) {
        solutions += 1
        for (const [variable, value] of assignments) if (value === 1) mineCounts.set(variable, mineCounts.get(variable) + 1)
        return
      }
      const variable = component.variables[position]
      assignments.set(variable, 0); search(position + 1)
      assignments.set(variable, 1); search(position + 1)
      assignments.set(variable, undefined)
    }
    search(0)
    if (solutions) for (const variable of component.variables) risks.set(variable, mineCounts.get(variable) / solutions)
  }
  return risks
}

function chooseMineActions(state) {
  const byId = new Map(state.cells.map((cell) => [`${cell.row}_${cell.column}`, cell]))
  const existingFlags = new Set([...byId].filter(([, cell]) => cell.state === 'flag').map(([id]) => id))
  const mines = new Set(existingFlags)
  const safe = new Set()
  const chords = new Set()
  const risks = new Map()
  for (const cell of state.cells) {
    if (typeof cell.state !== 'number' || cell.state === 0) continue
    const adjacent = neighbors(cell.row, cell.column, state.rows, state.columns)
    const unknown = adjacent.filter((id) => byId.get(id)?.state === 'covered' && !mines.has(id))
    const flagged = adjacent.filter((id) => mines.has(id)).length
    const remaining = cell.state - flagged
    if (unknown.length && remaining === unknown.length) unknown.forEach((id) => mines.add(id))
    if (unknown.length && cell.state === flagged) { unknown.forEach((id) => safe.add(id)); if (flagged) chords.add(`${cell.row}_${cell.column}`) }
    if (unknown.length && remaining >= 0) unknown.forEach((id) => risks.set(id, Math.max(risks.get(id) || 0, remaining / unknown.length)))
  }
  const constraints = []
  for (const cell of state.cells) {
    if (typeof cell.state !== 'number' || cell.state === 0) continue
    const adjacent = neighbors(cell.row, cell.column, state.rows, state.columns)
    const cells = adjacent.filter((id) => byId.get(id)?.state === 'covered' && !mines.has(id))
    const remaining = cell.state - adjacent.filter((id) => mines.has(id)).length
    if (cells.length && remaining >= 0 && remaining <= cells.length) constraints.push({ cells, remaining })
  }
  const exactRisks = exactFrontierRisks(constraints)
  for (const [id, risk] of exactRisks) {
    risks.set(id, risk)
    if (risk === 0) safe.add(id)
    if (risk === 1) mines.add(id)
  }
  for (const mine of mines) safe.delete(mine)
  const newMines = new Set([...mines].filter((mine) => !existingFlags.has(mine)))
  if (safe.size) return { mines: newMines, safe, chords }
  const covered = state.cells.filter((cell) => cell.state === 'covered')
  const mineTotal = state.rows === 9 && state.columns === 9 ? 10 : state.rows === 16 && state.columns === 16 ? 40 : 99
  const remainingMineDensity = Math.max(0, Math.min(1, (mineTotal - existingFlags.size) / Math.max(1, covered.length)))
  const fallback = covered.sort((first, second) => {
    const firstId = `${first.row}_${first.column}`
    const secondId = `${second.row}_${second.column}`
    const firstRisk = risks.has(firstId) ? risks.get(firstId) : remainingMineDensity
    const secondRisk = risks.has(secondId) ? risks.get(secondId) : remainingMineDensity
    const riskDifference = firstRisk - secondRisk
    if (riskDifference) return riskDifference
    const frontierDifference = Number(risks.has(firstId)) - Number(risks.has(secondId))
    if (frontierDifference) return -frontierDifference
    return Math.abs(first.row - state.rows / 2) + Math.abs(first.column - state.columns / 2) - Math.abs(second.row - state.rows / 2) - Math.abs(second.column - state.columns / 2)
  })[0]
  return { mines: newMines, safe: fallback ? new Set([`${fallback.row}_${fallback.column}`]) : new Set(), chords }
}

async function applyMinesweeperActions(mines, targets) {
  await Promise.all(mines.map((id) => page.locator(`[id="${id}"]`).click({ button: 'right', timeout: 1000 }).catch(() => {})))
  await Promise.all(targets.map((id) => page.locator(`[id="${id}"]`).click({ timeout: 1000 }).catch(() => {})))
}

async function minesweeperStep() {
  if (!session.running) return
  try {
    const state = await readMinesweeperBoard()
    if (state.lost) {
      session.attempts += 1
      session.status = `Mine hit · restarting attempt ${session.attempts}`
      await page.reload({ waitUntil: 'domcontentloaded' })
      const difficulty = game.split('-')[1] || 'beginner'
      await page.locator(`#${difficulty}`).evaluate((element) => element.click()).catch(() => {})
      await page.locator('input.dialogText').evaluate((element) => element.click()).catch(() => {})
      session.attemptMoves = 0
      loop = setTimeout(minesweeperStep, 350)
      return
    }
    session.board = state.cells.map((cell) => typeof cell.state === 'number' ? cell.state : cell.state === 'flag' ? -1 : 0)
    session.rows = state.rows
    session.columns = state.columns
    session.best = state.cells.filter((cell) => cell.state === 'covered').length
    if (!session.best) {
      const elapsed = (Date.now() - session.startedAt) / 1000
      if (session.goal === 'record' && elapsed > session.recordSeconds) {
        session.attempts += 1
        session.status = `Cleared in ${elapsed.toFixed(1)}s · retrying for ${session.recordSeconds}s record`
        await page.reload({ waitUntil: 'domcontentloaded' })
        const difficulty = game.split('-')[1] || 'beginner'
        await page.locator(`#${difficulty}`).evaluate((element) => element.click()).catch(() => {})
        await page.locator('input.dialogText').evaluate((element) => element.click()).catch(() => {})
        session.startedAt = Date.now()
        session.attemptMoves = 0
        loop = setTimeout(minesweeperStep, 350)
        return
      }
      return stop(session.goal === 'record' ? `Record beaten in ${elapsed.toFixed(1)}s` : 'Minesweeper cleared')
    }
    const actions = chooseMineActions(state)
    if (session.attemptMoves === 0) session.startedAt = Date.now()
    const safeCells = [...actions.safe]
    const clickTargets = [...new Set([...safeCells, ...actions.chords])]
    if (clickTargets.length || actions.mines.size) { await applyMinesweeperActions([...actions.mines], clickTargets); session.moves += safeCells.length; session.attemptMoves += safeCells.length; session.status = `Live Minesweeper: opened ${safeCells.length} safe cells` }
    else return stop('No safe Minesweeper move remains', 'stopped')
    loop = setTimeout(minesweeperStep, 15)
  } catch (error) {
    if (String(error).includes('page') || String(error).includes('closed')) return stop('Game tab closed', 'stopped')
    return stop('Minesweeper automation stopped', 'stopped')
  }
}

async function pongStep() {
  if (!session.running || !game.startsWith('pong')) return
  try {
    const state = await readPongState(page)
    session.board = [state.scoreMy, state.scoreCpu]
    session.rows = 1
    session.columns = 2
    session.best = state.scoreMy
    if (pongGoalMet(state, session.goal)) return stop(`Pong goal reached: ${state.scoreMy} points`)
    if (state.finished) {
      if (state.won || state.scoreMy >= session.goal) return stop('Pong won: ' + state.scoreMy + '-' + state.scoreCpu, 'success')
      session.attempts = (session.attempts || 0) + 1
      session.status = 'Pong lost ' + state.scoreMy + '-' + state.scoreCpu + ' · restarting attempt ' + session.attempts
      await restartPongGame(page)
      await page.waitForTimeout(350)
      pongLastY = null
      loop = setTimeout(pongStep, 250)
      return
    }
    const difficulty = game.split('-')[1] || 'medium'
    const action = shouldPaddleMove(state, pongLastY, difficulty)
    if (action.dir && action.dir !== 'none') {
      await paddleKeyboardMove(page, action.dir)
      pongLastY = state.paddleY
      session.moves += 1
      session.status = `Pong: moving ${action.dir} · score ${state.scoreMy}-${state.scoreCpu}`
    } else {
      session.status = `Pong: tracking ball · score ${state.scoreMy}-${state.scoreCpu}`
    }
    loop = setTimeout(pongStep, 40)
  } catch (error) {
    if (String(error).includes('closed')) return stop('Game tab closed', 'stopped')
    return stop('Pong automation stopped', 'stopped')
  }
}

async function stop(message) {
  clearTimeout(loop)
  session.running = false
  session.status = message
}

async function readSudokuBoard() {
  return page.locator('.su-cell').evaluateAll((cells) => cells.map((cell) => {
    const value = Number(cell.getAttribute('aria-label'))
    return Number.isInteger(value) && value > 0 ? value : 0
  }))
}

function solveSudoku(source) {
  const board = [...source]
  function search() {
    let empty = -1
    let candidates = null
    for (let index = 0; index < 81; index += 1) {
      if (board[index]) continue
      const row = Math.floor(index / 9)
      const column = index % 9
      const used = new Set()
      for (let offset = 0; offset < 9; offset += 1) { used.add(board[row * 9 + offset]); used.add(board[offset * 9 + column]); used.add(board[(Math.floor(row / 3) * 3 + Math.floor(offset / 3)) * 9 + Math.floor(column / 3) * 3 + offset % 3]) }
      const available = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((value) => !used.has(value))
      if (!available.length) return false
      if (!candidates || available.length < candidates.length) { empty = index; candidates = available }
    }
    if (empty < 0) return true
    for (const value of candidates) { board[empty] = value; if (search()) return true }
    board[empty] = 0
    return false
  }
  return search() ? board : null
}

async function sudokuStep() {
  if (!session.running) return
  try {
    const puzzle = await readSudokuBoard()
    const solution = solveSudoku(puzzle)
    if (!solution) return stop('Sudoku puzzle could not be solved', 'stopped')
    const moves = []
    puzzle.forEach((value, index) => { if (!value) moves.push({ index, value: solution[index] }) })
    for (const move of moves) {
      await page.locator(`[data-testid="sudoku-cell-${move.index}"]`).click({ timeout: 1000, force: true })
      await page.locator(`.su-keyboard svg[data-number="${move.value}"]`).click({ timeout: 1000, force: true })
    }
    session.moves = moves.length
    session.board = solution
    session.status = `Solved NYT Sudoku · ${moves.length} cells filled`
    stop('Sudoku completed')
  } catch (error) {
    if (String(error).includes('closed')) return stop('Game tab closed', 'stopped')
    return stop('NYT Sudoku automation stopped', 'stopped')
  }
}

async function solitaireStep() {
  if (!session.running || game !== 'solitaire') return
  try {
    const state = await readSolitaireState(page)
    // visible-position signature (NO move counter: same board reached twice = loop).
    // wasteTop.ci is the full waste index, so draws naturally give new signatures.
    const signature = solitaireSignature(state)
    session.visits = session.visits || new Map()
    session.triedMoves = session.triedMoves || new Map()
    session.stepCount = (session.stepCount || 0) + 1
    const seenBefore = session.visits.has(signature)
    session.visitCount = (session.visits.get(signature) || 0) + 1
    session.visits.set(signature, session.visitCount)
    const foundationTotal = state.foundations.reduce((total, top) => total + (top ? top.rank : 0), 0)
    session.best = foundationTotal
    // track REAL progress: foundations + face-down flipped. move counter includes draws.
    const faceDown = state.tableau.reduce((n, col) => n + col.filter((c) => !c.faceUp).length, 0)
    const progress = foundationTotal * 100 - faceDown
    if (session.bestProgress === undefined) session.bestProgress = progress
    if (progress > session.bestProgress) {
      session.bestProgress = progress
      session.sinceProgress = 0
    } else {
      session.sinceProgress = (session.sinceProgress || 0) + 1
    }
    session.board = [foundationTotal, faceDown, ...state.tableau.map((column) => column.length)]
    session.rows = 2
    session.columns = 4
    session.moves = state.moves
    if (state.won || foundationTotal === 52) return stop('Solitaire completed')
    // hard safety: 600 solver steps with no win -> redeal (prevents 202-move stall in screenshot)
    if (session.stepCount > 600) {
      session.attempts = (session.attempts || 0) + 1
      session.status = `Solitaire · step cap hit, fresh deal ${session.attempts}`
      await page.locator('#btn-new').click({ timeout: 2000 }).catch(() => {})
      session.stepCount = 0
      session.sinceProgress = 0
      session.bestProgress = undefined
      session.visits = new Map()
      session.triedMoves = new Map()
      session.banned = []
      session.cycles = 0
      session.noProgress = 0
      loop = setTimeout(solitaireStep, 1200)
      return
    }
    if (state.finishVisible) {
      session.status = `Solitaire auto-finish · foundations ${foundationTotal}/52`
      await page.locator('#btn-finish').click({ timeout: 2000 }).catch(() => {})
      loop = setTimeout(solitaireStep, 900)
      return
    }
    // DFS backtracking: push every real move onto a decision stack so we can
    // rewind to the last branch with untried alternatives (not just 1 undo).
    session.decisions = session.decisions || []
    // gather ranked moves, skip ones already tried+failed from this exact position
    const tried = session.triedMoves.get(signature) || new Set()
    let action = chooseSolitaireAction(state, { banned: [...(session.banned || []), ...tried] })
    // if greedy choice was already tried here, walk the ranked list for an untried alternative
    if (tried.has(action.key || action.type)) {
      const alt = listSolitaireMoves(state).find((m) => !tried.has(m.key) && !(session.banned || []).includes(m.key))
      if (alt) action = alt
    }
    // DFS backtrack: same visible position 4+ times OR revisit of a fully-tried
    // position at a recycle point -> rewind the decision stack to last branch.
    // NOTE: a bare recycle keeps tableau+foundations identical while waste rotates,
    // so only count REAL repeats (fully-tried positions), not every revisit.
    const triedHere = session.triedMoves.get(signature) || new Set()
    const allRanked = listSolitaireMoves(state)
    const untriedHere = allRanked.filter((m) => !triedHere.has(m.key) && !(session.banned || []).includes(m.key))
    const deadEnd = seenBefore && !untriedHere.length && action.type === 'draw' && action.recycle
    if (session.visitCount >= 4 || deadEnd) {
      // mark the move that led here as tried at its PARENT position
      if (session.decisions.length) {
        const last = session.decisions[session.decisions.length - 1]
        const parentTried = session.triedMoves.get(last.from) || new Set()
        parentTried.add(last.key)
        session.triedMoves.set(last.from, parentTried)
      }
      // pop decisions until we find a position with untried alternatives
      let rewound = 0
      while (session.decisions.length && rewound < 12) {
        const top = session.decisions[session.decisions.length - 1]
        const parentSig = top.from
        const parentTried = session.triedMoves.get(parentSig) || new Set()
        // re-read current alternatives at parent? approximate: if parent still has
        // untried keys beyond what we recorded, stop rewinding there
        await page.locator('#btn-undo').click({ timeout: 1200 }).catch(() => {})
        await page.waitForTimeout(300)
        rewound += 1
        const now = await readSolitaireState(page).catch(() => null)
        if (!now) break
        const nowSig = solitaireSignature(now)
        const nowTried = session.triedMoves.get(nowSig) || new Set()
        const nowAlts = listSolitaireMoves(now).filter((m) => !nowTried.has(m.key))
        session.decisions.pop()
        if (nowAlts.length > 0) break
        if (nowSig === parentSig) break
      }
      session.status = `Solitaire · backtracking ${rewound} moves to last branch (${foundationTotal}/52)`
      session.banned = []
      session.lastTableauMove = null
      session.visits.set(signature, 0)
      session.sinceProgress = 0
      loop = setTimeout(solitaireStep, 700)
      return
    }
    session.lastSignature = signature
    session.lastActionKey = action.key || action.type
    const pushDecision = () => {
      session.decisions.push({ from: signature, key: session.lastActionKey, type: action.type })
      if (session.decisions.length > 400) session.decisions.shift()
    }
    // no real progress for 80 steps (flips/foundations) -> undo storm then redeal
    if ((session.sinceProgress || 0) > 80) {
      let undos = 0
      while (undos < 6) {
        const r = await page.locator('#btn-undo').click({ timeout: 1000 }).catch(() => 'failed')
        if (r === 'failed') break
        undos += 1
        await page.waitForTimeout(250)
      }
      if (undos > 0) {
        session.status = `Solitaire · no progress for 80 steps, rewound ${undos} moves (${foundationTotal}/52)`
        session.sinceProgress = 0
        session.banned = []
        loop = setTimeout(solitaireStep, 700)
        return
      }
      session.attempts = (session.attempts || 0) + 1
      session.status = `Solitaire · truly stuck, fresh deal ${session.attempts}`
      await page.locator('#btn-new').click({ timeout: 2000 }).catch(() => {})
      session.stepCount = 0
      session.sinceProgress = 0
      session.bestProgress = undefined
      session.visits = new Map()
      session.triedMoves = new Map()
      session.banned = []
      session.cycles = 0
      session.noProgress = 0
      loop = setTimeout(solitaireStep, 1200)
      return
    }
    // DFS backtracking: push every real move onto a decision stack so we can
    // rewind to the last branch with untried alternatives (not just 1 undo).
    // NOTE: session.decisions + tried/alt selection already ran above; just execute.
    if (action.type === 'foundation') {
      const selector = action.pile === 'waste' ? '#waste .card.movable' : `.card[data-pile="tableau"][data-idx="${action.idx}"][data-ci="${action.ci}"]`
      const movesBefore = state.moves
      await page.locator(selector).first().dblclick({ timeout: 2000, force: true }).catch(async () => {
        await page.locator(selector).first().click({ timeout: 2000, force: true }).catch(() => {})
      })
      await page.waitForTimeout(350)
      const verify = await readSolitaireState(page).catch(() => null)
      if (verify && verify.moves === movesBefore) {
        const set = session.triedMoves.get(signature) || new Set()
        set.add(session.lastActionKey)
        session.triedMoves.set(signature, set)
        session.status = `Solitaire · ${solitaireCardLabel(action.card)} blocked, trying alternative`
        loop = setTimeout(solitaireStep, 300)
        return
      }
      session.status = `Solitaire · ${solitaireCardLabel(action.card)} to foundation (${foundationTotal}/52)`
      session.cycles = 0
      session.banned = []
      session.lastTableauMove = null
      session.noProgress = 0
      pushDecision()
      loop = setTimeout(solitaireStep, 450)
      return
    }
    if (action.type === 'tableau') {
      const targetCount = state.tableau[action.to].length
      const movesBefore = state.moves
      await dragTableauCard(page, action.from, action.start, action.to, targetCount ? targetCount - 1 : null).catch(() => {})
      await page.waitForTimeout(400)
      const verify = await readSolitaireState(page).catch(() => null)
      if (verify && verify.moves === movesBefore) {
        const set = session.triedMoves.get(signature) || new Set()
        set.add(session.lastActionKey)
        session.triedMoves.set(signature, set)
        session.banned = [...(session.banned || []), session.lastActionKey].slice(-12)
        session.status = `Solitaire · tableau move blocked, trying alternative (${foundationTotal}/52)`
        loop = setTimeout(solitaireStep, 300)
        return
      }
      // detect no-op ping-pong: if last move was the exact reverse, ban that direction for a while.
      // compare CARD identity (not just column): A->B then B->A of the same card = loop.
      const movedCard = state.tableau[action.from][action.start]
      const movedId = movedCard ? `${movedCard.rank}${movedCard.suit}` : ''
      const lastId = session.lastTableauCard || ''
      const moveKey = `t:${action.from}:${action.start}->${action.to}`
      const reverseKey = `t:${action.to}:${targetCount}->${action.from}`
      session.banned = session.banned || []
      if (session.lastTableauMove === reverseKey && movedId && movedId === lastId) {
        session.banned.push(moveKey)
        session.status = `Solitaire · ping-pong ${movedId} detected, banning ${moveKey} (${foundationTotal}/52)`
      } else {
        session.status = `Solitaire · moving run to column ${action.to + 1} (${foundationTotal}/52)`
      }
      if (session.banned.length > 12) session.banned.splice(0, session.banned.length - 12)
      session.lastTableauMove = moveKey
      session.lastTableauCard = movedId
      session.cycles = 0
      session.noProgress = action.flips || action.runLength > 1 ? 0 : (session.noProgress || 0) + 1
      pushDecision()
      loop = setTimeout(solitaireStep, 650)
      return
    }
    if (action.type === 'waste-tableau') {
      const targetCount = state.tableau[action.to].length
      const movesBefore = state.moves
      await dragWasteCard(page, action.to, targetCount ? targetCount - 1 : null).catch(async () => {
        await page.locator('#waste .card.movable').last().click({ timeout: 1500 }).catch(() => {})
      })
      await page.waitForTimeout(400)
      const verify = await readSolitaireState(page).catch(() => null)
      if (verify && verify.moves === movesBefore) {
        const set = session.triedMoves.get(signature) || new Set()
        set.add(session.lastActionKey)
        session.triedMoves.set(signature, set)
        session.status = `Solitaire · waste move blocked, trying alternative (${foundationTotal}/52)`
        loop = setTimeout(solitaireStep, 300)
        return
      }
      session.status = `Solitaire · waste to column ${action.to + 1} (${foundationTotal}/52)`
      session.cycles = 0
      session.noProgress = 0
      pushDecision()
      loop = setTimeout(solitaireStep, 550)
      return
    }
    if (action.type === 'foundation-tableau') {
      const targetCount = state.tableau[action.to].length
      const movesBefore = state.moves
      await dragFoundationCard(page, action.foundationIdx, action.to, targetCount ? targetCount - 1 : null).catch(() => {})
      await page.waitForTimeout(400)
      const verify = await readSolitaireState(page).catch(() => null)
      if (verify && verify.moves === movesBefore) {
        const set = session.triedMoves.get(signature) || new Set()
        set.add(session.lastActionKey)
        session.triedMoves.set(signature, set)
        session.status = `Solitaire · pullback blocked, trying alternative (${foundationTotal}/52)`
        loop = setTimeout(solitaireStep, 300)
        return
      }
      session.status = `Solitaire · pulling ${solitaireCardLabel(action.card)} back to unlock a flip (${foundationTotal}/52)`
      session.cycles = 0
      session.noProgress = 0
      pushDecision()
      loop = setTimeout(solitaireStep, 550)
      return
    }
    if (action.type === 'draw') {
      await page.locator('#stock-slot').click({ timeout: 2000, force: true }).catch(() => {})
      session.cycles = (session.cycles || 0) + 1
      session.noProgress = (session.noProgress || 0) + 1
      session.status = state.recycleVisible ? `Solitaire · recycling stock (${foundationTotal}/52)` : `Solitaire · drawing from stock (${foundationTotal}/52)`
      // a full stock pass with zero flips/foundations = this line is dead -> undo to branch or redeal
      if (action.recycle) {
        if ((session.noProgress || 0) > 24) {
          const undone = await page.locator('#btn-undo').click({ timeout: 1500 }).catch(() => 'failed')
          if (undone !== 'failed') {
            session.status = `Solitaire · dead pass, backtracking (${foundationTotal}/52)`
            session.noProgress = 0
            session.cycles = 0
            loop = setTimeout(solitaireStep, 700)
            return
          }
        }
      }
      if (session.cycles > 80) {
        session.attempts = (session.attempts || 0) + 1
        session.status = `Solitaire · deal stuck, starting fresh deal ${session.attempts}`
        await page.locator('#btn-new').click({ timeout: 2000 }).catch(() => {})
        session.cycles = 0
        session.noProgress = 0
        session.visits = new Map()
        session.triedMoves = new Map()
        session.banned = []
        loop = setTimeout(solitaireStep, 1200)
        return
      }
      loop = setTimeout(solitaireStep, 450)
      return
    }
    session.attempts = (session.attempts || 0) + 1
    session.status = `Solitaire · no moves left, starting fresh deal ${session.attempts}`
    await page.locator('#btn-new').click({ timeout: 2000 }).catch(() => {})
    // Draw 1 has ~2x the win rate of Draw 3: force it after every redeal
    await page.locator('#draw1').click({ timeout: 1500 }).catch(() => {})
    session.stepCount = 0
    session.sinceProgress = 0
    session.bestProgress = undefined
    session.visits = new Map()
    session.triedMoves = new Map()
    session.decisions = []
    session.banned = []
    session.cycles = 0
    session.noProgress = 0
    loop = setTimeout(solitaireStep, 1200)
  } catch (error) {
    if (String(error).includes('closed')) return stop('Game tab closed', 'stopped')
    loop = setTimeout(solitaireStep, 900)
  }
}

async function step() {
  if (game.startsWith('pong')) return pongStep()
  if (game === 'solitaire') return solitaireStep()
  if (game.startsWith('sudoku')) return sudokuStep()
  if (game.startsWith('minesweeper')) return minesweeperStep()
  if (!session.running) return
  try { session.board = await readLiveBoard() } catch (error) { return stop(String(error).includes('closed') ? 'Game tab closed' : '2048 automation stopped', 'stopped') }
  if (!session.board.some(Boolean)) { loop = setTimeout(step, 250); return }
  session.best = Math.max(...session.board)
  if (session.best >= session.goal) return stop(`Goal reached: ${session.goal} tile`)
  const direction = chooseMove(session.board)
  const hasLegalMove = directions.some((candidate) => simulate(session.board, candidate).some((value, index) => value !== session.board[index]))
  if (!hasLegalMove) return stop('No legal moves remain')
  try { await page.keyboard.press(arrows[direction]) } catch (error) { return stop(String(error).includes('closed') ? 'Game tab closed' : '2048 automation stopped', 'stopped') }
  session.moves += 1
  session.status = `Live game: moved ${direction}`
  loop = setTimeout(step, 220)
}

async function start(goal, selectedGame = '2048') {
  game = selectedGame
  if (!browser || !browser.isConnected()) browser = await chromium.launch({ headless: false, executablePath: browserPath })
  page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  const sessionPage = page
  page.on('close', () => { if (page === sessionPage && session.running) stop('Game tab closed', 'stopped') })
  const sudokuDifficulty = game.split('-')[1] || 'easy'
  const pongDifficulty = game.split('-')[1] || 'medium'
  const sudokuPageUrl = `${sudokuUrl.split('?')[0]}/${sudokuDifficulty}?eafs_enabled=false`
  const pongPageUrl = pongUrlForDifficulty()
  await page.goto(game.startsWith('minesweeper') ? minesweeperUrl : game.startsWith('sudoku') ? sudokuPageUrl : game === 'solitaire' ? solitaireUrl : game.startsWith('pong') ? pongPageUrl : gameUrl, { waitUntil: 'domcontentloaded' })
  if (game.startsWith('minesweeper')) {
    const difficulty = game.split('-')[1] || 'beginner'
    await page.locator(`#${difficulty}`).evaluate((element) => element.click()).catch(() => {})
    await page.locator('input.dialogText').evaluate((element) => element.click()).catch(() => {})
    await page.locator('div.square').first().waitFor({ state: 'attached', timeout: 5000 })
  } else if (game.startsWith('sudoku')) {
    await page.locator('.su-cell').first().waitFor({ state: 'attached', timeout: 10000 })
    await page.locator('button[aria-label="close"], .xwd__modal--close').first().click({ timeout: 1500 }).catch(() => {})
  } else if (game.startsWith('pong')) {
    // v1.4: vygam/Pong must remain on /pong. Some navigation events can
    // unexpectedly land on the site home page, so verify and recover before
    // interacting with the game controls.
    const pongUrl = 'https://vygam.com/pong'
    await page.waitForTimeout(800)
    console.log(`[PONG] Requested URL: ${pongUrl}`)
    console.log(`[PONG] Actual URL after load: ${page.url()}`)
    if (!page.url().startsWith(pongUrl)) {
      console.log('[PONG] Unexpected URL after load; returning to /pong')
      await page.goto(pongUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
    }
    const difficultySelected = await selectPongDifficulty(page, pongDifficulty)
    await page.waitForTimeout(250)
    console.log(`[PONG] URL after difficulty selection: ${page.url()}`)
    if (!page.url().startsWith(pongUrl)) {
      console.log('[PONG] Difficulty click navigated away; restoring /pong')
      await page.goto(pongUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
      console.log('[PONG] Difficulty was not applied after navigation; continuing on /pong')
    }
    const gameStarted = await startPongGame(page)
    await page.waitForTimeout(250)
    console.log(`[PONG] URL after Start: ${page.url()}`)
    if (!page.url().startsWith(pongUrl)) {
      console.log('[PONG] Start click navigated away; restoring /pong')
      await page.goto(pongUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
    }
    // Do not click an arbitrary body coordinate here: (20,20) can hit vygam's
    // navigation/logo and send the page from /pong back to the site homepage.
    // Arrow-key control works through page.keyboard without that click.
    pongLastY = null
    if (!difficultySelected) console.log(`Pong difficulty button not found: ${pongDifficulty}`)
    if (!gameStarted) console.log('Pong start button not found; continuing with live state detection')
    console.log(`[PONG] Final URL: ${page.url()}`)
  } else if (game !== 'solitaire') {
    await page.getByText('New Game', { exact: true }).click().catch(() => {})
    await page.locator('.tile-container .tile').first().waitFor({ state: 'attached', timeout: 5000 })
  } else if (game === 'solitaire') {
    await page.locator('#board-panel').waitFor({ state: 'attached', timeout: 10000 })
    await page.locator('#tableau .col .card').first().waitFor({ state: 'attached', timeout: 10000 })
    // Draw 1 deals one card at a time = every stock card reachable = highest win rate.
    await page.locator('#draw1').click({ timeout: 2000 }).catch(() => {})
  }
  const difficulty = game.split('-')[1]
  const recordSeconds = difficulty === 'beginner' ? 1 : difficulty === 'intermediate' ? 16 : 52
    session = { running: true, status: game.startsWith('sudoku') ? `NYT Sudoku ${sudokuDifficulty} loaded` : game === 'solitaire' ? 'Solitaire loaded' : game.startsWith('pong') ? `Pong ${pongDifficulty} loaded` : 'Live game: starting', moves: 0, attemptMoves: 0, best: 0, attempts: 0, goal, recordSeconds, startedAt: Date.now(), rows: game.startsWith('minesweeper') ? 9 : game.startsWith('pong') ? 1 : 4, columns: game.startsWith('minesweeper') ? 9 : game.startsWith('pong') ? 2 : 4, board: [], cycles: 0, banned: [], lastTableauMove: null, lastTableauCard: '', stepCount: 0, sinceProgress: 0, bestProgress: undefined, visits: new Map(), triedMoves: new Map(), decisions: [], noProgress: 0 }
  step()
}

const vite = await createViteServer({ server: { middlewareMode: true } })
const server = http.createServer(async (request, response) => {
  if (request.url === '/api/status') return sendJson(response, session)
  if (request.url === '/api/run' && request.method === 'POST') {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', async () => { try { const payload = JSON.parse(body); const rawGoal = payload.goal; const goal = payload.game === 'solitaire' ? 'complete' : payload.game?.startsWith('pong') ? Number(rawGoal || 7) : Number(rawGoal || 2048); await start(goal, payload.game || '2048'); sendJson(response, session) } catch { response.writeHead(500, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: 'Unable to start game automation' })) } })
    return
  }
  if (request.url === '/api/stop' && request.method === 'POST') { await stop('Automation paused'); return sendJson(response, session) }
  vite.middlewares(request, response, () => { response.statusCode = 404; response.end('Not found') })
})
server.listen(5173, () => console.log('Runbook live at http://localhost:5173'))
