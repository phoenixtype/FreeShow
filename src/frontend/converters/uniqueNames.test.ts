import { describe, expect, it } from "vitest"
import { uniqueNames } from "./uniqueNames"

describe("uniqueNames", () => {
    it("numbers repeats in a batch, ignoring case", () => {
        expect(uniqueNames(["Amazing Grace", "amazing grace", "Amazing Grace", "Holy"], [])).toEqual(["Amazing Grace", "amazing grace 2", "Amazing Grace 3", "Holy"])
    })

    it("avoids names already in the library", () => {
        expect(uniqueNames(["Holy", "Way Maker"], ["holy", "Holy 2"])).toEqual(["Holy 3", "Way Maker"])
    })
})
