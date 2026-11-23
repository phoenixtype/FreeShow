import type express from "express"
import { ContentProvider, type BaseAuthData } from "../base/ContentProvider"
import { templeAccess, templeDisconnect, templeLoadServices, type TempleScopes } from "./request"

type TempleAuthData = BaseAuthData

/**
 * Temple service plans and songs. Temple has no OAuth yet: the church pastes an
 * API token, so connect and refresh are the token check in request.ts.
 */
export class TempleProvider extends ContentProvider<TempleScopes, TempleAuthData> {
    constructor() {
        super({
            providerId: "temple",
            displayName: "Temple",
            port: 5506,
            clientId: "",
            clientSecret: "",
            apiUrl: "https://blvxyvvtoetcvvnakfxi.supabase.co/functions/v1/public-api/v1",
            scopes: ["services"] as const
        })
    }

    isConnected(scope: TempleScopes): boolean {
        return !!templeAccess(scope)
    }

    // a token arrives through loadServices({ token }); nothing to open in a browser
    async connect(scope: TempleScopes): Promise<TempleAuthData | null> {
        const access = templeAccess(scope)
        if (!access) return null
        return { access_token: access.access_token, refresh_token: "", token_type: "Bearer", created_at: access.created_at, expires_in: 0, scope }
    }

    disconnect(scope: TempleScopes = "services"): void {
        templeDisconnect(scope)
    }

    async apiRequest(_data: any): Promise<any> {
        // Not used: request.ts owns the API calls.
        return null
    }

    async loadServices(data?: { token?: string; planId?: string }): Promise<void> {
        return templeLoadServices(data)
    }

    async startupLoad(scope: TempleScopes, data?: { planId?: string }): Promise<void> {
        if (!templeAccess(scope)) return
        return templeLoadServices(data)
    }

    protected handleAuthCallback(_req: express.Request, _res: express.Response): void {
        // No OAuth callback: Temple uses a pasted token.
    }

    protected async refreshToken(_scope: TempleScopes): Promise<TempleAuthData | null> {
        return null
    }

    protected async authenticate(_scope: TempleScopes): Promise<TempleAuthData | null> {
        return null
    }
}
