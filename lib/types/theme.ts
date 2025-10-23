export const COLOR_PACKS = ["lime", "blue"] as const
export type ColorPack = typeof COLOR_PACKS[number]

export function isColorPack(value: string): value is ColorPack {
    return (COLOR_PACKS as readonly string[]).includes(value)
}

