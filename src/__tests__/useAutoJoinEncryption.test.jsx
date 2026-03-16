import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAutoJoinEncryption } from '../hooks/useAutoJoinEncryption'
import { useAppStore } from '../store/useAppStore'

vi.mock('../store/useAppStore')
vi.mock('../contexts/E2eContext', () => ({
  useE2e: vi.fn()
}))

import { useE2e } from '../contexts/E2eContext'

describe('useAutoJoinEncryption Hook', () => {
  const mockJoinServerEncryption = vi.fn()
  const mockAutoEnrollServerEncryption = vi.fn()
  const mockGetServerEncryptionStatus = vi.fn()

  const mockE2eContext = {
    isEncryptionEnabled: vi.fn(),
    hasDecryptedKey: vi.fn(),
    joinServerEncryption: mockJoinServerEncryption,
    autoEnrollServerEncryption: mockAutoEnrollServerEncryption,
    getServerEncryptionStatus: mockGetServerEncryptionStatus
  }

  const wrapper = ({ children }) => <div>{children}</div>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    useE2e.mockReturnValue(mockE2eContext)
    mockJoinServerEncryption.mockResolvedValue(true)
    mockAutoEnrollServerEncryption.mockResolvedValue(true)
    mockGetServerEncryptionStatus.mockResolvedValue({ enabled: true, enrolled: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Auto-join on server change', () => {
    it('should not attempt to join when encryption is not enabled', async () => {
      useAppStore.mockReturnValue({
        currentServer: { id: 'server-1' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(false)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)

      renderHook(() => useAutoJoinEncryption(), { wrapper })

      await waitFor(() => {
        expect(mockJoinServerEncryption).not.toHaveBeenCalled()
      })
    })

    it('should not attempt to join when user already has decrypted key', async () => {
      useAppStore.mockReturnValue({
        currentServer: { id: 'server-1' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(true)

      renderHook(() => useAutoJoinEncryption(), { wrapper })

      await waitFor(() => {
        expect(mockJoinServerEncryption).not.toHaveBeenCalled()
      })
    })

    it('should attempt to join when encryption is enabled and user has no key', async () => {
      useAppStore.mockReturnValue({
        currentServer: { id: 'server-1' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)

      renderHook(() => useAutoJoinEncryption(), { wrapper })

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledWith('server-1')
      })
    })

    it('should not attempt to join when no current server is set', async () => {
      useAppStore.mockReturnValue({
        currentServer: null
      })

      renderHook(() => useAutoJoinEncryption(), { wrapper })

      await waitFor(() => {
        expect(mockJoinServerEncryption).not.toHaveBeenCalled()
      })
    })
  })

  describe('Retry logic', () => {
    it('should retry on failure up to MAX_RETRIES times', async () => {
      useAppStore.mockReturnValue({
        currentServer: { id: 'server-1' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)
      mockJoinServerEncryption
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(true)

      renderHook(() => useAutoJoinEncryption(), { wrapper })

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledTimes(1)
      })

      vi.advanceTimersByTime(50)

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledTimes(2)
      })

      vi.advanceTimersByTime(50)

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledTimes(3)
      })
    })

    it('should stop retrying after MAX_RETRIES attempts', async () => {
      useAppStore.mockReturnValue({
        currentServer: { id: 'server-1' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)
      mockJoinServerEncryption.mockRejectedValue(new Error('Network error'))

      renderHook(() => useAutoJoinEncryption(), { wrapper })

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledTimes(1)
      })

      vi.advanceTimersByTime(50)

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledTimes(2)
      })

      vi.advanceTimersByTime(50)

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledTimes(3)
      })

      vi.advanceTimersByTime(50)

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledTimes(3)
      })
    })

    it('should reset retry count on successful join', async () => {
      useAppStore.mockReturnValue({
        currentServer: { id: 'server-1' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)
      mockJoinServerEncryption.mockResolvedValue(true)

      const { result } = renderHook(() => useAutoJoinEncryption(), { wrapper })

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalled()
      })

      expect(result.current.getRetryCount('server-1')).toBe(0)
    })
  })

  describe('Processing state', () => {
    it('should track processing state correctly', async () => {
      useAppStore.mockReturnValue({
        currentServer: { id: 'server-1' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)
      mockJoinServerEncryption.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 20))
      )

      const { result } = renderHook(() => useAutoJoinEncryption(), { wrapper })

      expect(result.current.isProcessing('server-1')).toBe(true)

      await waitFor(() => {
        expect(result.current.isProcessing('server-1')).toBe(false)
      }, { timeout: 100 })
    })

    it('should not process same server multiple times concurrently', async () => {
      useAppStore.mockReturnValue({
        currentServer: { id: 'server-1' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)
      mockJoinServerEncryption.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 20))
      )

      const { rerender } = renderHook(() => useAutoJoinEncryption(), { wrapper })

      rerender()
      rerender()

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledTimes(1)
      }, { timeout: 100 })
    })
  })

  describe('Server change handling', () => {
    it('should handle server change correctly', async () => {
      useAppStore.mockReturnValue({
        currentServer: { id: 'server-1' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)
      mockJoinServerEncryption.mockResolvedValue(true)

      const { rerender } = renderHook(() => useAutoJoinEncryption(), { wrapper })

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledWith('server-1')
      })

      useAppStore.mockReturnValue({
        currentServer: { id: 'server-2' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)

      rerender()

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledWith('server-2')
      })
    })

    it('should reset retry state when server changes', async () => {
      useAppStore.mockReturnValue({
        currentServer: { id: 'server-1' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)
      mockJoinServerEncryption.mockRejectedValue(new Error('Error'))

      const { result, rerender } = renderHook(() => useAutoJoinEncryption(), { wrapper })

      await waitFor(() => {
        expect(result.current.getRetryCount('server-1')).toBeGreaterThan(0)
      }, { timeout: 100 })

      useAppStore.mockReturnValue({
        currentServer: { id: 'server-2' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)
      mockJoinServerEncryption.mockResolvedValue(true)

      rerender()

      await waitFor(() => {
        expect(result.current.getRetryCount('server-2')).toBe(0)
      })
    })
  })

  describe('Edge cases', () => {
    it('should handle undefined server ID gracefully', async () => {
      useAppStore.mockReturnValue({
        currentServer: {}
      })

      renderHook(() => useAutoJoinEncryption(), { wrapper })

      await waitFor(() => {
        expect(mockJoinServerEncryption).not.toHaveBeenCalled()
      })
    })

    it('should handle joinServerEncryption returning false', async () => {
      useAppStore.mockReturnValue({
        currentServer: { id: 'server-1' }
      })

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)
      mockJoinServerEncryption.mockResolvedValue(false)

      renderHook(() => useAutoJoinEncryption(), { wrapper })

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalled()
      }, { timeout: 100 })
    })

    it('should handle rapid server changes', async () => {
      const servers = ['server-1', 'server-2', 'server-3']
      let serverIndex = 0

      useAppStore.mockImplementation(() => ({
        currentServer: { id: servers[serverIndex] }
      }))

      mockE2eContext.isEncryptionEnabled.mockReturnValue(true)
      mockE2eContext.hasDecryptedKey.mockReturnValue(false)
      mockJoinServerEncryption.mockResolvedValue(true)

      const { rerender } = renderHook(() => useAutoJoinEncryption(), { wrapper })

      for (let i = 1; i < servers.length; i++) {
        serverIndex = i
        rerender()
      }

      await waitFor(() => {
        expect(mockJoinServerEncryption).toHaveBeenCalledWith('server-3')
      })
    })
  })
})