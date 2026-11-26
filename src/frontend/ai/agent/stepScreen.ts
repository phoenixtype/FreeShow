import { get } from "svelte/store"
import { OutputHelper } from "../../components/helpers/OutputHelper"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { scriptureDrawerOpen } from "../../components/drawer/bible/scripture"
import { outLocked } from "../../stores"
import { triggerFunction } from "../../utils/common"
import { passageStep } from "../manager/passageStep"
import { currentScripture, presentPassage } from "./presentPassage"
import { isAncientWritings } from "../../scriptural/ancientRules"

/** Next or previous, whatever is up: a verse follows its verse, a slide its slide. False when there was nothing to step. */
export async function stepScreen(direction: "next" | "previous"): Promise<boolean> {
    if (get(outLocked)) return false
    if (getFirstActiveOutput()?.out?.slide?.id !== "temp") {
        OutputHelper.advanceOutputs(direction, "copilot")
        return true
    }
    // the Scripture tab also steps through the parts of a long verse
    if (get(scriptureDrawerOpen)) {
        // a verse the operator picked from the ancient writings is stepped by hand only
        if (isAncientWritings(currentScripture().id)) return false
        triggerFunction(`scripture_${direction}`)
        return true
    }

    const step = await passageStep({ type: "verse-step", delta: direction === "next" ? 1 : -1 })
    return step ? presentPassage(step.reference, step.id) : false
}
