// A schedule tool appends ⟦grid:N⟧ (N = weekOffset) — optionally
// ⟦grid:N:D:templateId⟧ to highlight one shift (D = dayOfWeek). Both the
// Assistant tab and the floating copilot parse it: render that week's grid
// (highlighting the cell if given), and strip the marker from the shown text.

export const GRID_MARKER = /⟦grid:(-?\d)(?::(\d):([^⟧]+))?⟧/

export interface GridHighlight {
  dayOfWeek: number
  templateId: string
}

export function parseGridMarker(body: string): {
  text: string
  gridWeek: number | null
  highlight: GridHighlight | null
} {
  const m = body.match(GRID_MARKER)
  if (!m) return { text: body, gridWeek: null, highlight: null }
  const highlight =
    m[2] != null && m[3] != null ? { dayOfWeek: parseInt(m[2], 10), templateId: m[3] } : null
  return { text: body.replace(GRID_MARKER, "").trim(), gridWeek: parseInt(m[1], 10), highlight }
}
