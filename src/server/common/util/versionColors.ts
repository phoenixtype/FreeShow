// one colour per Bible version shown side by side: blue, teal, orange, green and grey, in turn
const VERSION_COLORS = ["#6ea8ff", "#4fd1c5", "#f6ad55", "#68d391", "#a0aec0"]

export const getVersionColor = (index: number) => VERSION_COLORS[index % VERSION_COLORS.length]
// the same colour, faint, behind it
export const getVersionBgColor = (index: number) => getVersionColor(index) + "1f"
