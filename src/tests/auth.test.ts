import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authService } from '../services/authService'
import { supabase } from '@/integrations/supabase/client'

describe('AuthService MFA', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('initializeMFA should return secret and qr code on success', async () => {
        const mockData = {
            id: 'factor_123',
            totp: {
                secret: 'SECRET123',
                qr_code: 'data:image/png;base64,...'
            }
        }

        // @ts-ignore
        supabase.auth.mfa.enroll.mockResolvedValue({ data: mockData, error: null })

        const result = await authService.initializeMFA()

        expect(result).toEqual({
            id: 'factor_123',
            secret: 'SECRET123',
            qr: 'data:image/png;base64,...'
        })
    })

    it('verifyMFA should return success when verification passes', async () => {
        // @ts-ignore
        supabase.auth.mfa.verify.mockResolvedValue({ data: { access_token: 'token' }, error: null })
        // @ts-ignore
        supabase.auth.mfa.challenge.mockResolvedValue({ data: { id: 'challenge_123' }, error: null })

        const result = await authService.verifyMFA('factor_123', '123456')
        expect(result).toEqual({})
    })
})
