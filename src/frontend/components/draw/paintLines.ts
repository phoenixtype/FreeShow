// Sets the drawing on the paint layer from code (Matthias), on this window and on every
// output window, which does not see the operator's mouse and so cannot redraw it itself.

import { get } from "svelte/store"
import { OUTPUT } from "../../../types/Channels"
import type { DrawLine } from "../../../types/Draw"
import { drawSettings, drawTool, paintCache } from "../../stores"
import { send } from "../../utils/request"
import { clone } from "../helpers/array"

export function setPaintLines(lines: DrawLine[]) {
    const next = clone(lines)
    // the paint tool is the one that shows a drawing
    if (get(drawTool) !== "paint") drawTool.set("paint")
    if (!get(drawSettings).paint) drawSettings.update((a) => ({ ...a, paint: { color: "#ffffff", size: 10, straight: false, hold: true } }))
    paintCache.set(next)
    send(OUTPUT, ["PAINT_LINES"], next)
}
