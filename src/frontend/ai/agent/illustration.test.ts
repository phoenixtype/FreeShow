import { describe, expect, it } from "vitest"
import { cleanUp, illustrate, MAX_SHAPES, simplify, toStrokes } from "./illustration"

const res = { width: 1920, height: 1080 }

describe("illustrate", () => {
    it("turns a line into screen strokes ended by a pen lift", () => {
        const { lines, drawn } = illustrate(
            [
                {
                    type: "line",
                    points: [
                        [0, 0],
                        [100, 100]
                    ],
                    color: "#ff0000"
                }
            ],
            res
        )
        expect(drawn).toBe(1)
        expect(lines[0]).toMatchObject({ x: 0, y: 0, color: "#ff0000" })
        expect(lines[1]).toMatchObject({ x: 1920, y: 1080 })
        expect(lines[2]).toBe("mouseup")
    })
    it("gives an arrow a head and a circle a closed ring", () => {
        expect(
            toStrokes(
                illustrate(
                    [
                        {
                            type: "arrow",
                            points: [
                                [10, 50],
                                [60, 50]
                            ]
                        }
                    ],
                    res
                ).lines
            )
        ).toHaveLength(3)
        const ring = toStrokes(illustrate([{ type: "circle", x: 50, y: 50, r: 10 }], res).lines)[0]
        expect(ring[0]).toEqual(ring[ring.length - 1])
    })
    it("skips what cannot be drawn and says so", () => {
        const answer = illustrate([{ type: "line", points: [[1, 1]] }, { type: "star" }, { type: "rect", x: 10, y: 10, w: 20, h: 20 }, null, { type: "circle", x: "a", y: 1, r: 2 }], res)
        expect(answer.drawn).toBe(1)
        expect(answer.skipped).toBe(4)
    })
    it("keeps points on the screen, a safe colour and a bounded pen", () => {
        const { lines } = illustrate(
            [
                {
                    type: "line",
                    points: [
                        [-50, 500],
                        [20, 20]
                    ],
                    color: "url(javascript:1)",
                    size: 999
                }
            ],
            res
        ) as any
        expect(lines[0].x).toBe(0)
        expect(lines[0].y).toBe(1080)
        expect(lines[0].color).toBe("#ffffff")
        expect(lines[0].size).toBeLessThanOrEqual(Math.round(0.06 * res.width))
    })
    it("caps how many shapes are drawn", () => {
        const many = Array.from({ length: MAX_SHAPES + 10 }, () => ({
            type: "line",
            points: [
                [0, 0],
                [1, 1]
            ]
        }))
        const answer = illustrate(many, res)
        expect(answer.drawn).toBe(MAX_SHAPES)
        expect(answer.skipped).toBe(10)
        expect(illustrate("nope", res).drawn).toBe(0)
    })
})

describe("cleanUp", () => {
    const pen = (points: [number, number][]) => [...points.map(([x, y]) => ({ x, y, size: 10, color: "#00ff00" })), "mouseup" as const]

    it("makes a wobbly near-straight stroke a straight one, keeping colour and size", () => {
        const wobble = pen(Array.from({ length: 30 }, (_, i) => [i * 40, 100 + (i % 2 ? 4 : -4)] as [number, number]))
        const out = toStrokes(cleanUp(wobble, res))
        expect(out).toHaveLength(1)
        expect(out[0]).toHaveLength(2)
        expect(out[0][0]).toMatchObject({ size: 10, color: "#00ff00" })
    })
    it("makes a rough loop a round one", () => {
        const loop = pen(Array.from({ length: 36 }, (_, i) => [500 + Math.cos((i / 36) * 6.28) * (100 + (i % 3) * 8), 500 + Math.sin((i / 36) * 6.28) * (100 + (i % 3) * 8)] as [number, number]))
        const ring = toStrokes(cleanUp(loop, res))[0]
        const radii = ring.map((p) => Math.hypot(p.x - ring.reduce((s, q) => s + q.x, 0) / ring.length, p.y - ring.reduce((s, q) => s + q.y, 0) / ring.length))
        expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(6)
    })
    it("smooths a corner but keeps both ends, and leaves strokes apart", () => {
        const corner = [
            ...pen([
                [0, 0],
                [200, 0],
                [200, 200]
            ]),
            ...pen([
                [400, 400],
                [500, 500]
            ])
        ]
        const out = toStrokes(cleanUp(corner, res))
        expect(out).toHaveLength(2)
        expect(out[0][0]).toMatchObject({ x: 0, y: 0 })
        expect(out[0][out[0].length - 1]).toMatchObject({ x: 200, y: 200 })
        expect(out[0].length).toBeGreaterThan(3)
    })
    it("does nothing to nothing", () => {
        expect(cleanUp([], res)).toEqual([])
        expect(simplify([{ x: 0, y: 0 }], 1)).toHaveLength(1)
    })
})
