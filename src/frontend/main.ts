// ----- FreeShow -----
// Svelte app entry point

import "svelte"
import { set_raf } from "svelte/internal"
import App from "./App.svelte"

// Svelte transitions start at performance.now() but end based on requestAnimationFrame timestamps.
// In output windows the frame timestamps can run hundreds of ms ahead, ending transitions on the first frame.
// Use the same clock for both so transitions always run their full duration.
set_raf((cb: (time: number) => void) => requestAnimationFrame(() => cb(performance.now())))

const app = new App({ target: document.body })

export default app
