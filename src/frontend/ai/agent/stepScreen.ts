import { OutputHelper } from "../../components/helpers/OutputHelper"
import { getFirstActiveOutput } from "../../components/helpers/output"
import { triggerFunction } from "../../utils/common"

/** Next or previous, whatever is up: a verse follows its verse, a slide its slide. */
export function stepScreen(direction: "next" | "previous") {
    if (getFirstActiveOutput()?.out?.slide?.id === "temp") triggerFunction(`scripture_${direction}`)
    else OutputHelper.advanceOutputs(direction, "copilot")
}
