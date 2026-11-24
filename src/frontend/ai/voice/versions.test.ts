import { expect, it } from "vitest"
import { matchVersion } from "./versions"

const list = [
    { id: "nkjv", names: ["New King James Version", "NKJV"] },
    { id: "kjv", names: ["King James Version", "KJV"] },
    { id: "nlt", names: ["New Living Translation", "NLT"] },
    { id: "msg", names: ["The Message", "MSG"] },
    { id: "ampc", names: ["Amplified Bible, Classic Edition", "AMPC"] }
]
it("knows a version however it is said", () => {
    expect(matchVersion("king james", list)).toBe("kjv")
    expect(matchVersion("new king james", list)).toBe("nkjv")
    expect(matchVersion("nlt", list)).toBe("nlt")
    expect(matchVersion("n l t", list)).toBe("nlt")
    expect(matchVersion("en el tea", list)).toBe("nlt")
    expect(matchVersion("message", list)).toBe("msg")
    expect(matchVersion("amplified", list)).toBe("ampc")
    expect(matchVersion("klingon", list)).toBeNull()
})
