// The tools the server answers itself, beside the app's own. No app code here, so the
// README's tool table can be checked against them.

import type { McpTool } from "./mcpProtocol"

export const ownTools: McpTool[] = [
    {
        name: "get_screen_image",
        description: "A picture of what a screen shows right now.",
        inputSchema: { type: "object", properties: {} },
        readOnly: true
    },
    {
        name: "add_media",
        // a file of the same name in the media folder is replaced
        destructive: true,
        description: "Add a picture, video, sound, PDF or slide deck to the media folder, from a web address or a file on this computer. A file on this computer can be shown now if asked; one from the web is only saved.",
        inputSchema: {
            type: "object",
            properties: { source: { type: "string", description: "https address or full file path" }, name: { type: "string", description: "File name to save it as" }, show: { type: "boolean" } },
            required: ["source"]
        }
    }
]
