"use server"

import { prisma } from "@/lib/db"
import { requireAuth } from "@/lib/auth-utils"
import { COLOR_PACKS, type ColorPack } from "@/lib/types/theme"
import { revalidatePath } from "next/cache"

export async function setThemePack(pack: ColorPack) {
    const user = await requireAuth()
    if (!(COLOR_PACKS as readonly string[]).includes(pack)) {
        throw new Error("Invalid color pack")
    }

    await prisma.user.update({ where: { id: user.id }, data: { themePack: pack } })

    // Revalidate root and dashboard pages so the html data attribute updates on SSR
    revalidatePath("/")
}

