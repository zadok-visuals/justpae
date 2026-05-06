import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock key Supabase functionality
vi.mock('@/integrations/supabase/client', () => ({
    supabase: {
        auth: {
            getUser: vi.fn(),
            signInWithPassword: vi.fn(),
            signOut: vi.fn(),
            mfa: {
                enroll: vi.fn(),
                verify: vi.fn(),
                getAuthenticatorAssuranceLevel: vi.fn(),
                listFactors: vi.fn(),
            }
        },
        from: vi.fn(() => ({
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(),
                    order: vi.fn(),
                })),
            })),
        })),
    }
}))
