export async function readSolitaireState(page) {
  return page.evaluate(() => {
    const readCard = (element) => {
      if (!element) return null
      const rankText = (element.querySelector('.r')?.textContent || '').trim()
      const suitText = (element.querySelector('.s')?.textContent || '').trim()
      const rankMap = { A: 1, J: 11, Q: 12, K: 13 }
      const rank = rankMap[rankText] || Number(rankText) || 0
      const suit = suitText === '♠' ? 's' : suitText === '♥' ? 'h' : suitText === '♦' ? 'd' : suitText === '♣' ? 'c' : ''
      if (!rank || !suit) return null
      return { rank, suit }
    }
    const tableau = []
    document.querySelectorAll('#tableau .col').forEach((column) => {
      const cards = [...column.querySelectorAll('.card')].map((element) => {
        const faceUp = element.classList.contains('up')
        const info = faceUp ? readCard(element) : null
        return { faceUp, rank: info ? info.rank : 0, suit: info ? info.suit : '', ci: Number(element.dataset.ci || 0) }
      })
      tableau.push(cards)
    })
    const foundations = [...document.querySelectorAll('#foundations .foundation')].map((slot) => readCard(slot.querySelector('.card')))
    const wasteCards = [...document.querySelectorAll('#waste .card')].map((element) => ({ card: readCard(element), ci: Number(element.dataset.ci || 0) })).filter((entry) => entry.card)
    const wasteTop = wasteCards.length ? { ...wasteCards[wasteCards.length - 1].card, ci: wasteCards[wasteCards.length - 1].ci } : null
    const stockSlot = document.getElementById('stock-slot')
    const stockHasCards = Boolean(stockSlot?.querySelector('.card.down'))
    const recycleEl = stockSlot?.querySelector('.recycle')
    // recycle icon visibility: game toggles inline style, but be robust to CSS-class toggling too
    const recycleStyleVisible = recycleEl ? recycleEl.style.display !== 'none' : false
    const recycleClassVisible = recycleEl ? getComputedStyle(recycleEl).display !== 'none' : false
    // ground truth: stock empty + waste showing = clicking stock recycles, whatever the icon says
    const recycleVisible = recycleStyleVisible || recycleClassVisible || (!stockHasCards && wasteCards.length > 0)
    const finishButton = document.getElementById('btn-finish')
    const finishVisible = finishButton ? getComputedStyle(finishButton).display !== 'none' : false
    const bodyText = document.body?.innerText || ''
    const overlayVisible = document.getElementById('modal-overlay')?.classList.contains('visible')
    const won = /you won|every card is home/i.test(bodyText) || (overlayVisible && /won|win/i.test(bodyText))
    const moves = Number(document.getElementById('stat-moves')?.textContent || 0)
    return { tableau, foundations, wasteTop, stockHasCards, recycleVisible, finishVisible, won, moves }
  })
}

export function solitaireSignature(state) {
  const tab = state.tableau.map((col) => col.map((c) => (c.faceUp ? `${c.rank}${c.suit}` : 'X')).join(',')).join('|')
  const found = state.foundations.map((f) => (f ? `${f.rank}${f.suit}` : '-')).join(',')
  const waste = state.wasteTop ? `${state.wasteTop.rank}${state.wasteTop.suit}#${state.wasteTop.ci}` : '-'
  return `${found}~${tab}~${waste}~${state.stockHasCards ? 'S' : ''}${state.recycleVisible ? 'R' : ''}`
}

export function solitaireLevels(state) {
  const base = { s: 0, h: 0, d: 0, c: 0 }
  for (const top of state.foundations) if (top) base[top.suit] = Math.max(base[top.suit], top.rank)
  return base
}

export function canFoundation(card, levels) {
  if (!card || !card.rank) return false
  return card.rank === (levels[card.suit] || 0) + 1
}

export function moveKey(move) {
  if (move.type === 'foundation') return `f:${move.pile}:${move.idx}:${move.card.rank}${move.card.suit}`
  if (move.type === 'tableau') return `t:${move.from}:${move.start}->${move.to}`
  if (move.type === 'waste-tableau') return `w->${move.to}`
  if (move.type === 'foundation-tableau') return `ft:${move.foundationIdx}->${move.to}`
  return 'draw'
}

export function isOrderedRun(cards) {
  for (let i = 0; i < cards.length - 1; i += 1) {
    const a = cards[i]
    const b = cards[i + 1]
    if (!a.faceUp || !b.faceUp || !a.rank || !b.rank) return false
    const redA = a.suit === 'h' || a.suit === 'd'
    const redB = b.suit === 'h' || b.suit === 'd'
    if (redA === redB || a.rank !== b.rank + 1) return false
  }
  return true
}

export function listSolitaireMoves(state) {
  const levels = solitaireLevels(state)
  const moves = []
  // --- ENDGAME fast path: every tableau card face-up -> hammer foundations every step.
  // The old scorer ranked waste-tableau (300) ABOVE safe foundations capped at ~800+15
  // inconsistently and wasted steps shuffling when everything was already winnable.
  const faceDownTotal = state.tableau.reduce((n, col) => n + col.filter((c) => !c.faceUp).length, 0)
  const endgame = faceDownTotal === 0 && !state.tableau.some((col) => col.length > 1 && col.some((c, i) => c.faceUp && i < col.length - 1 && !isOrderedRun(col.slice(i))))
  if (endgame) {
    state.tableau.forEach((column, columnIndex) => {
      if (!column.length) return
      const top = column[column.length - 1]
      if (top.faceUp && top.rank && canFoundation(top, levels)) {
        moves.push({ type: 'foundation', pile: 'tableau', idx: columnIndex, ci: top.ci, card: top, safe: true, flips: false, key: '' })
      }
    })
    if (state.wasteTop && canFoundation(state.wasteTop, levels)) {
      moves.push({ type: 'foundation', pile: 'waste', idx: 0, ci: state.wasteTop.ci, card: state.wasteTop, safe: true, flips: false, key: '' })
    }
    if (moves.length) {
      for (const move of moves) if (!move.key) move.key = moveKey(move)
      // lowest rank first = strict foundation order, minimum steps
      moves.sort((a, b) => a.card.rank - b.card.rank)
      return moves.map((m, i) => ({ ...m, score: 2000 - i }))
    }
    // all face-up but blocked: fall through to normal movegen (tableau order fixes)
  }
  state.tableau.forEach((column, columnIndex) => {
    if (!column.length) return
    const top = column[column.length - 1]
    if (top.faceUp && top.rank && canFoundation(top, levels)) {
      const below = column.length > 1 ? column[column.length - 2] : null
      moves.push({ type: 'foundation', pile: 'tableau', idx: columnIndex, ci: top.ci, card: top, safe: safeFoundation(top, levels), flips: Boolean(below && !below.faceUp), key: '' })
    }
  })
  if (state.wasteTop && canFoundation(state.wasteTop, levels)) {
    moves.push({ type: 'foundation', pile: 'waste', idx: 0, ci: state.wasteTop.ci, card: state.wasteTop, safe: safeFoundation(state.wasteTop, levels), flips: false, key: '' })
  }
  // foundation -> tableau pullback: reclaim a foundation card to unlock a flip
  // (needed when a low card went up too early and blocks a buried run)
  state.foundations.forEach((top, foundationIdx) => {
    if (!top) return
    for (let to = 0; to < 7; to += 1) {
      const targetCol = state.tableau[to]
      const target = targetCol.length ? targetCol[targetCol.length - 1] : null
      if (target && !target.faceUp) continue
      if (canStack(top, target)) {
        // only useful if some column has a face-down card to expose
        const exposesSomething = state.tableau.some((col) => col.some((c) => !c.faceUp))
        if (exposesSomething) moves.push({ type: 'foundation-tableau', foundationIdx, to, card: { ...top }, flips: false, runLength: 1, toEmpty: !target, safe: false, key: '' })
      }
    }
  })
  state.tableau.forEach((column, from) => {
    const firstFaceUp = column.findIndex((card) => card.faceUp)
    if (firstFaceUp < 0) return
    for (let start = firstFaceUp; start < column.length; start += 1) {
      const moving = column[start]
      const runLength = column.length - start
      for (let to = 0; to < 7; to += 1) {
        if (to === from) continue
        const targetCol = state.tableau[to]
        const target = targetCol.length ? targetCol[targetCol.length - 1] : null
        if (target && !target.faceUp) continue
        if (!target && moving.rank !== 13) continue
        if (!canStack(moving, target)) continue
        if (!target && !column.slice(0, start).length) continue
        moves.push({ type: 'tableau', from, start, to, flips: firstFaceUp > 0 && start === firstFaceUp, runLength, toEmpty: !target, safe: true, key: '' })
      }
    }
  })
  if (state.wasteTop) {
    for (let to = 0; to < 7; to += 1) {
      const targetCol = state.tableau[to]
      const target = targetCol.length ? targetCol[targetCol.length - 1] : null
      if (target && !target.faceUp) continue
      if (!target && state.wasteTop.rank !== 13) continue
      if (canStack(state.wasteTop, target)) moves.push({ type: 'waste-tableau', to, flips: false, runLength: 1, toEmpty: !target, safe: true, key: '' })
    }
  }
  if (state.stockHasCards || state.recycleVisible) {
    moves.push({ type: 'draw', flips: false, runLength: 0, safe: true, recycle: !state.stockHasCards && state.recycleVisible, key: 'draw' })
  }
  for (const move of moves) if (!move.key) move.key = moveKey(move)
  return rankSolitaireMoves(state, moves)
}

export function rankSolitaireMoves(state, moves) {
  const empties = state.tableau.filter((c) => !c.length).length
  const faceDownTotal = state.tableau.reduce((n, col) => n + col.filter((c) => !c.faceUp).length, 0)
  // MIDGAME: waste/tableau cards rot while stock cycles. Speed = never draw twice
  // for the same board job. Foundations win games; draws just deal new info.
  const scored = moves.map((move) => {
    let score = 0
    if (move.type === 'foundation') {
      // absolute top: A/2/safe/flipping go NOW. Unsafe mid cards wait UNLESS the
      // game is nearly uncovered (faceDown<=4): then holding them back only burns
      // full stock cycles at ~24 draws per pass. Push them up and finish.
      if (move.card.rank === 1) score = 1100
      else if (move.card.rank === 2) score = 1050
      else if (move.flips) score = 1000
      else if (move.safe) score = 950
      else if (faceDownTotal <= 4) score = 900
      else {
        const neededBelow = state.tableau.some((col) => {
          if (!col.length) return false
          const top = col[col.length - 1]
          return top.faceUp && top.rank === move.card.rank - 1 && ((top.suit === 'h' || top.suit === 'd') !== (move.card.suit === 'h' || move.card.suit === 'd'))
        })
        score = neededBelow ? 60 : 250
      }
      if (move.pile === 'waste') score += 25 // frees next waste card = new info
    } else if (move.type === 'tableau') {
      if (move.flips) {
        // tip: flip ASAP, but hold empties for kings that unlock long runs
        const buried = state.tableau[move.from].filter((c) => !c.faceUp).length
        score = 700 + move.runLength * 8 + buried * 60 + (move.toEmpty ? 0 : 40)
        if (move.toEmpty) score -= move.runLength <= 1 ? 260 : 40
        if (move.toEmpty && move.runLength > 1) score += 60
        // flipping a column with many buried cards beats a shallow flip
        if (buried >= 3) score += 80
      } else {
        // shuffles never win: cap FAR below draw (40) so solver cycles stock
        // instead of sliding the same run back and forth (your 92-move stall).
        score = -100 + move.runLength * 4 - (move.toEmpty ? 60 : 0)
        // consolidation that unblocks a buried column indirectly: check source leaves a playable top
        const src = state.tableau[move.from]
        const newTop = src.length > move.runLength ? src[src.length - move.runLength - 1] : null
        if (newTop && newTop.faceUp) score += 10
      }
    } else if (move.type === 'waste-tableau') {
      // waste->tableau that enables NOTHING is just parking: the old 300 beat safe
      // foundations and caused exactly your loop (Jh->Qc, Kc->empty, recycle, repeat).
      // Play it down ONLY if it unblocks a flip column; otherwise keep cycling —
      // but never rank parking above draw, or solver shuffles instead of dealing.
      const targetCol = state.tableau[move.to]
      const flipsAfter = targetCol.some((c) => !c.faceUp)
      if (move.toEmpty) {
        score = state.wasteTop && state.wasteTop.rank === 13 && flipsAfter ? 60 : -120
      } else {
        score = flipsAfter ? 200 : -40
      }
    } else if (move.type === 'foundation-tableau') {
      // pullback is a desperation move: only take when no flip/build/foundation exists
      score = -300
    } else if (move.type === 'draw') {
      // drawing is the ONLY way to see new cards: rank above any shuffle/parking.
      score = move.recycle ? -50 : 120
    }
    if ((move.type === 'tableau' || move.type === 'waste-tableau') && move.toEmpty && empties <= 1 && (move.runLength || 1) <= 1) score -= 60
    return { ...move, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored
}

function reverseTableauKey(move, state) {
  const targetLen = state.tableau[move.to] ? state.tableau[move.to].length : 0
  return `t:${move.to}:${targetLen}->${move.from}`
}

function simulateTableauMove(state, move) {
  try {
    const tableau = state.tableau.map((col) => col.map((c) => ({ ...c })))
    const run = tableau[move.from].slice(move.start)
    if (!run.length) return null
    tableau[move.from] = tableau[move.from].slice(0, move.start)
    if (tableau[move.from].length && !tableau[move.from][tableau[move.from].length - 1].faceUp) {
      const top = tableau[move.from][tableau[move.from].length - 1]
      tableau[move.from][tableau[move.from].length - 1] = { ...top, faceUp: true, rank: 14, suit: top.suit || 's' }
    }
    tableau[move.to] = [...tableau[move.to], ...run]
    return { ...state, tableau }
  } catch { return null }
}

export function chooseSolitaireAction(state, options = {}) {
  const banned = new Set(options.banned || [])
  if (state.won) return { type: 'won' }
  if (state.finishVisible) return { type: 'finish' }
  const candidates = listSolitaireMoves(state).filter((m) => !banned.has(m.key))
  const pool = candidates.length ? candidates : listSolitaireMoves(state)
  if (!pool.length) return { type: 'stuck' }
  if (!candidates.length) {
    const drawOnly = pool.find((m) => m.type === 'draw')
    if (drawOnly) return drawOnly
    return { type: 'stuck' }
  }
  for (const candidate of candidates) {
    if (candidate.type === 'tableau' && !candidate.flips) {
      const next = simulateTableauMove(state, candidate)
      if (next) {
        const reverse = reverseTableauKey(candidate, state)
        const followups = listSolitaireMoves(next).filter((m) => m.type !== 'draw' && m.key !== reverse)
        const useful = followups.some((m) => (m.type === 'foundation' && (m.safe || m.card.rank <= 2)) || (m.type === 'tableau' && m.flips) || m.type === 'waste-tableau')
        // single-card shuffles need a plan; multi-card non-flip runs are also
        // shuffles — allow only if they unlock something, else prefer drawing.
        if (!useful && candidates.some((m) => m.type === 'draw')) continue
      }
    }
    if (candidate.type === 'foundation' && !candidate.safe && candidate.card.rank > 2) {
      const needsCard = state.tableau.some((col) => {
        if (!col.length) return false
        const top = col[col.length - 1]
        return top.faceUp && top.rank === candidate.card.rank + 1 && ((top.suit === 'h' || top.suit === 'd') !== (candidate.card.suit === 'h' || candidate.card.suit === 'd'))
      })
      if (needsCard) continue
    }
    if (candidate.type === 'foundation-tableau') {
      // pullback undoes foundation progress: only allow if it DIRECTLY enables a
      // flip move next ply (landing the card must open a buried column).
      const next = simulateFoundationPullback(state, candidate)
      if (!next) continue
      const followups = listSolitaireMoves(next).filter((m) => m.type === 'tableau' && m.flips)
      if (!followups.length) continue
    }
    return candidate
  }
  return candidates.find((m) => m.type === 'draw') || candidates[0] || { type: 'stuck' }
}

function simulateFoundationPullback(state, move) {
  try {
    const foundations = state.foundations.slice()
    const top = foundations[move.foundationIdx]
    if (!top || top.rank !== move.card.rank || top.suit !== move.card.suit) return null
    // foundation must step down by exactly this card: approximate by clearing top
    foundations[move.foundationIdx] = move.card.rank > 1
      ? { rank: move.card.rank - 1, suit: move.card.suit }
      : null
    const tableau = state.tableau.map((col) => col.map((c) => ({ ...c })))
    const targetCol = tableau[move.to]
    const target = targetCol.length ? targetCol[targetCol.length - 1] : null
    if (!canStack(move.card, target)) return null
    targetCol.push({ faceUp: true, rank: move.card.rank, suit: move.card.suit, ci: targetCol.length })
    return { ...state, foundations, tableau }
  } catch { return null }
}

export function solitaireCardLabel(card) {
  const rank = card.rank === 1 ? 'A' : card.rank === 11 ? 'J' : card.rank === 12 ? 'Q' : card.rank === 13 ? 'K' : String(card.rank)
  const glyph = { s: 'S', h: 'H', d: 'D', c: 'C' }
  return `${rank}${glyph[card.suit] || ''}`
}

export function safeFoundation(card, levels) {
  if (!card || !card.rank) return false
  if (card.rank <= 2) return true
  if (card.suit === 's' || card.suit === 'c') return levels.h >= card.rank - 1 && levels.d >= card.rank - 1
  return levels.s >= card.rank - 1 && levels.c >= card.rank - 1
}

export async function dragFoundationCard(page, foundationIdx, to, targetCi) {
  return page.evaluate(({ foundationIdx, to, targetCi }) => {
    const slots = [...document.querySelectorAll('#foundations .foundation')]
    const source = slots[foundationIdx]?.querySelector('.card')
    if (!source) return 'no-source'
    let target = null
    if (targetCi !== null && targetCi !== undefined) {
      target = document.querySelector(`.card[data-pile="tableau"][data-idx="${to}"][data-ci="${targetCi}"]`)
    }
    if (!target) target = document.querySelector(`#tableau .col[data-idx="${to}"]`)
    if (!target) return 'no-target'
    const dt = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
    return 'dropped'
  }, { foundationIdx, to, targetCi })
}

export async function dragTableauCard(page, from, start, to, targetCi) {
  return page.evaluate(({ from, start, to, targetCi }) => {
    const source = document.querySelector(`.card[data-pile="tableau"][data-idx="${from}"][data-ci="${start}"]`)
    if (!source) return 'no-source'
    let target = null
    if (targetCi !== null && targetCi !== undefined) {
      target = document.querySelector(`.card[data-pile="tableau"][data-idx="${to}"][data-ci="${targetCi}"]`)
    }
    if (!target) target = document.querySelector(`#tableau .col[data-idx="${to}"]`)
    if (!target) return 'no-target'
    const dt = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
    return 'dropped'
  }, { from, start, to, targetCi })
}

export async function dragWasteCard(page, to, targetCi) {
  return page.evaluate(({ to, targetCi }) => {
    const cards = [...document.querySelectorAll('#waste .card.movable')]
    const source = cards[cards.length - 1]
    if (!source) return 'no-source'
    let target = null
    if (targetCi !== null && targetCi !== undefined) {
      target = document.querySelector(`.card[data-pile="tableau"][data-idx="${to}"][data-ci="${targetCi}"]`)
    }
    if (!target) target = document.querySelector(`#tableau .col[data-idx="${to}"]`)
    if (!target) return 'no-target'
    const dt = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }))
    return 'dropped'
  }, { to, targetCi })
}

export function canStack(moving, target) {
  if (!moving || !moving.rank) return false
  const red = (suit) => suit === 'h' || suit === 'd'
  if (!target) return moving.rank === 13
  if (!target.faceUp || !target.rank) return false
  return red(moving.suit) !== red(target.suit) && moving.rank === target.rank - 1
}
