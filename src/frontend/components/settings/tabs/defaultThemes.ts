import type { Themes } from "../../../../types/Settings"

// Scriptural's two themes, taken from the Scriptural app's tokens (src/index.css there):
// near-black ground with near-white ink, and warm parchment with near-black ink.
export const defaultThemes: { [key: string]: Themes } = {
    default: {
        name: "default",
        default: true,
        font: {
            family: "Inter",
            size: "1em"
        },
        colors: {
            primary: "#121212",
            "primary-lighter": "#202020",
            "primary-darker": "#0d0d0d",
            "primary-darkest": "#080808",
            text: "#f7f7f7",
            textInvert: "#171717",
            "secondary-text": "#171717",
            secondary: "#f7f7f7",
            "secondary-opacity": "rgb(247 247 247 / 0.35)",
            hover: "rgb(255 255 255 / 0.05)",
            focus: "rgb(255 255 255 / 0.1)"
        }
    },
    light: {
        name: "light",
        default: true,
        font: {
            family: "Inter",
            size: "1em"
        },
        colors: {
            primary: "#ede9e3",
            "primary-lighter": "#e3dfd9",
            "primary-darker": "#f3f0ed",
            "primary-darkest": "#faf8f5",
            text: "#211f1c",
            textInvert: "#faf8f5",
            "secondary-text": "#faf8f5",
            secondary: "#211f1c",
            "secondary-opacity": "rgb(33 31 28 / 0.3)",
            hover: "rgb(0 0 0 / 0.04)",
            focus: "rgb(0 0 0 / 0.08)"
        }
    }
}
