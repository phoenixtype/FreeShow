// Pure drawing helpers for Matthias: simple shapes on a 0-100 grid become the same
// strokes the Paint tool records, and a rough drawing can be cleaned up. Nothing here
// touches the app, so it is all testable.

import type { DrawLine } from "../../../types/Draw"

export type Point = [number, number]
export type Shape = { type: "line" | "arrow" | "path"; points: Point[]; color?: string; size?: number } | { type: "circle"; x: number; y: number; r: number; color?: string; size?: number } | { type: "rect"; x: number; y: number; w: number; h: number; color?: string; size?: number }

type Stroke = { x: number; y: number; size: number; color: string }[]
export interface Resolution {
    width: number
    height: number
}

export const MAX_SHAPES = 60

/** what can be drawn on request without a model: plain shapes, large and centred */
export const SIMPLE_SHAPES = {
    cross: [
        {
            type: "line",
            points: [
                [50, 10],
                [50, 90]
            ],
            size: 2.5
        },
        {
            type: "line",
            points: [
                [30, 34],
                [70, 34]
            ],
            size: 2.5
        }
    ],
    circle: [{ type: "circle", x: 50, y: 50, r: 22, size: 2 }],
    arrow: [
        {
            type: "arrow",
            points: [
                [15, 50],
                [85, 50]
            ],
            size: 2
        }
    ],
    box: [{ type: "rect", x: 25, y: 20, w: 50, h: 60, size: 2 }],
    line: [
        {
            type: "line",
            points: [
                [15, 50],
                [85, 50]
            ],
            size: 2
        }
    ]
} as const satisfies Record<string, readonly Shape[]>
export type SimpleShape = keyof typeof SIMPLE_SHAPES
const DEFAULT_COLOR = "#ffffff"
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null)

function color(value: unknown) {
    return typeof value === "string" && HEX.test(value) ? value : DEFAULT_COLOR
}

/** the width of a pen, scaled to the screen so the same drawing looks the same on any output */
function penSize(value: unknown, res: Resolution) {
    const wanted = num(value) ?? 1.2
    return Math.round((clamp(wanted, 0.3, 6) / 100) * res.width)
}

/** a point on the 0-100 grid, in screen pixels; null when it is not a pair of numbers */
function toPixels(p: unknown, res: Resolution): { x: number; y: number } | null {
    if (!Array.isArray(p)) return null
    const x = num(p[0])
    const y = num(p[1])
    if (x === null || y === null) return null
    return { x: Math.round((clamp(x, 0, 100) / 100) * res.width), y: Math.round((clamp(y, 0, 100) / 100) * res.height) }
}

function circlePoints(cx: number, cy: number, rx: number, ry: number, steps = 40) {
    return Array.from({ length: steps + 1 }, (_, i) => {
        const a = (i / steps) * Math.PI * 2
        return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }
    })
}

/** an arrow is its line plus two short strokes at the end */
function arrowHead(from: { x: number; y: number }, to: { x: number; y: number }) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x)
    const length = Math.min(60, Math.max(24, Math.hypot(to.x - from.x, to.y - from.y) * 0.18))
    return [-1, 1].map((side) => [to, { x: to.x - Math.cos(angle + side * 0.5) * length, y: to.y - Math.sin(angle + side * 0.5) * length }])
}

/** the strokes a shape is made of, or null when the shape is not usable */
export function shapeStrokes(shape: Shape, res: Resolution): Stroke[] | null {
    if (!shape || typeof shape !== "object") return null
    const size = penSize((shape as any).size, res)
    const col = color((shape as any).color)
    const withStyle = (points: { x: number; y: number }[]): Stroke => points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), size, color: col }))

    if (shape.type === "line" || shape.type === "arrow" || shape.type === "path") {
        const points = (Array.isArray(shape.points) ? shape.points : []).map((p) => toPixels(p, res))
        if (points.length < 2 || points.some((p) => !p)) return null
        const px = points as { x: number; y: number }[]
        const strokes = [withStyle(px)]
        if (shape.type === "arrow") strokes.push(...arrowHead(px[px.length - 2], px[px.length - 1]).map(withStyle))
        return strokes
    }
    if (shape.type === "circle") {
        const c = toPixels([shape.x, shape.y], res)
        const r = num(shape.r)
        if (!c || r === null || r <= 0) return null
        const radius = (clamp(r, 0.5, 50) / 100) * res.width
        return [withStyle(circlePoints(c.x, c.y, radius, radius))]
    }
    if (shape.type === "rect") {
        const a = toPixels([shape.x, shape.y], res)
        const b = toPixels([(num(shape.x) ?? 0) + (num(shape.w) ?? 0), (num(shape.y) ?? 0) + (num(shape.h) ?? 0)], res)
        if (!a || !b || a.x === b.x || a.y === b.y) return null
        return [withStyle([a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }, a])]
    }
    return null
}

/** shapes become paint strokes; the answer says what could not be drawn */
export function illustrate(shapes: unknown, res: Resolution): { lines: DrawLine[]; drawn: number; skipped: number } {
    const list = Array.isArray(shapes) ? shapes.slice(0, MAX_SHAPES) : []
    const lines: DrawLine[] = []
    let drawn = 0
    for (const shape of list) {
        const strokes = shapeStrokes(shape as Shape, res)
        if (!strokes) continue
        drawn++
        for (const stroke of strokes) lines.push(...stroke, "mouseup")
    }
    return { lines, drawn, skipped: list.length - drawn + (Array.isArray(shapes) ? Math.max(0, shapes.length - MAX_SHAPES) : 0) }
}

/** the strokes of a drawing: points between pen lifts */
export function toStrokes(lines: DrawLine[]): Stroke[] {
    const strokes: Stroke[] = []
    let current: Stroke = []
    for (const line of lines) {
        if (line === "mouseup") {
            if (current.length) strokes.push(current)
            current = []
        } else current.push(line)
    }
    if (current.length) strokes.push(current)
    return strokes
}

export const fromStrokes = (strokes: Stroke[]): DrawLine[] => strokes.flatMap((stroke) => [...stroke, "mouseup" as const])

type P = { x: number; y: number }

function distanceToSegment(p: P, a: P, b: P) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy
    if (!lengthSq) return Math.hypot(p.x - a.x, p.y - a.y)
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq, 0, 1)
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Ramer-Douglas-Peucker: drops the points a hand wobble added */
export function simplify<T extends P>(points: T[], tolerance: number): T[] {
    if (points.length < 3) return points
    let farthest = 0
    let index = 0
    for (let i = 1; i < points.length - 1; i++) {
        const d = distanceToSegment(points[i], points[0], points[points.length - 1])
        if (d > farthest) {
            farthest = d
            index = i
        }
    }
    if (farthest <= tolerance) return [points[0], points[points.length - 1]]
    return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)]
}

/** Chaikin corner cutting: rounds the corners and keeps both ends */
export function smooth(points: P[], rounds = 2): P[] {
    let result = points
    for (let r = 0; r < rounds && result.length > 2; r++) {
        const next: P[] = [result[0]]
        for (let i = 0; i < result.length - 1; i++) {
            const a = result[i]
            const b = result[i + 1]
            next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 })
        }
        next.push(result[result.length - 1])
        result = next
    }
    return result
}

function pathLength(points: P[]) {
    let total = 0
    for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    return total
}

/** a closed, evenly round stroke: its centre and radius, else null */
function asCircle(points: P[]): { x: number; y: number; r: number } | null {
    if (points.length < 8) return null
    const length = pathLength(points)
    const first = points[0]
    const last = points[points.length - 1]
    if (Math.hypot(first.x - last.x, first.y - last.y) > length * 0.2) return null
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length
    const radii = points.map((p) => Math.hypot(p.x - cx, p.y - cy))
    const r = radii.reduce((sum, v) => sum + v, 0) / radii.length
    if (r < 8) return null
    const spread = Math.max(...radii.map((v) => Math.abs(v - r))) / r
    return spread < 0.3 ? { x: cx, y: cy, r } : null
}

/**
 * A rough drawing made tidy: wobble taken out, near-straight strokes made straight,
 * round ones made round, the rest smoothed. Colour and pen size stay as they were.
 */
export function cleanUp(lines: DrawLine[], res: Resolution): DrawLine[] {
    const tolerance = Math.max(2, res.width * 0.006)
    const cleaned = toStrokes(lines).map((stroke) => {
        const { size, color } = stroke[0]
        const style = (p: P) => ({ x: Math.round(p.x), y: Math.round(p.y), size, color })
        if (stroke.length < 3) return stroke
        const circle = asCircle(stroke)
        if (circle) return circlePoints(circle.x, circle.y, circle.r, circle.r).map(style)
        const simple = simplify(stroke, tolerance)
        if (simple.length === 2) return simple.map(style)
        return smooth(simple).map(style)
    })
    return fromStrokes(cleaned)
}
