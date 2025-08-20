"use client"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogOut, User, Settings, ChevronUp } from "lucide-react"

export function UserMenu() {
    const { data: session, isPending } = authClient.useSession()

    if (isPending) {
        return (
            <div className="flex items-center space-x-3 p-2 rounded-lg bg-muted/50">
                <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-1">
                    <div className="h-4 bg-muted animate-pulse rounded" />
                    <div className="h-3 bg-muted animate-pulse rounded w-3/4" />
                </div>
            </div>
        )
    }

    if (!session?.user) {
        return null
    }

    const handleSignOut = async () => {
        await authClient.signOut()
    }

    const userInitials = session.user.name
        ?.split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase() || session.user.email[0].toUpperCase()

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    className="w-full h-auto p-2 flex items-center gap-3 hover:bg-muted/80 rounded-lg transition-colors"
                >
                    <Avatar className="h-10 w-10 ring-2 ring-border">
                        <AvatarImage src={session.user.image || undefined} alt={session.user.name || ''} />
                        <AvatarFallback className="bg-primary text-primary-foreground font-medium">
                            {userInitials}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium leading-none truncate">
                            {session.user.name || 'Usuario'}
                        </p>
                        <p className="text-xs text-muted-foreground leading-none mt-1 truncate">
                            {session.user.email}
                        </p>
                    </div>
                    <ChevronUp className="h-4 w-4 text-muted-foreground ml-auto" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" side="top" forceMount>
                <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{session.user.name || 'Usuario'}</p>
                        <p className="text-xs leading-none text-muted-foreground">
                            {session.user.email}
                        </p>
                    </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    <span>Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Configuración</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Cerrar sesión</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
