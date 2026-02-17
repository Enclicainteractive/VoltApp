import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { apiService } from '../services/apiService'
import { useAuth } from './AuthContext'

const SelfVoltContext = createContext(undefined)

export const useSelfVolt = () => {
  const context = useContext(SelfVoltContext)
  if (!context) {
    throw new Error('useSelfVolt must be used within a SelfVoltProvider')
  }
  return context
}

export const SelfVoltProvider = ({ children }) => {
  const [selfVolts, setSelfVolts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { isAuthenticated } = useAuth()

  const loadSelfVolts = async () => {
    if (!isAuthenticated) return
    
    setLoading(true)
    try {
      const response = await apiService.getMySelfVolts()
      setSelfVolts(response?.data || [])
    } catch (err) {
      console.error('[SelfVolt] Error loading volts:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const addSelfVolt = async (data) => {
    setLoading(true)
    try {
      const response = await apiService.addSelfVolt(data)
      const newVolt = response?.data
      if (newVolt) {
        setSelfVolts(prev => [...prev, newVolt])
        return newVolt
      }
      return null
    } catch (err) {
      console.error('[SelfVolt] Error adding volt:', err)
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  const updateSelfVolt = async (voltId, data) => {
    try {
      const response = await apiService.updateSelfVolt(voltId, data)
      const updated = response?.data
      if (updated) {
        setSelfVolts(prev => prev.map(v => v.id === voltId ? updated : v))
        return updated
      }
      return null
    } catch (err) {
      console.error('[SelfVolt] Error updating volt:', err)
      return null
    }
  }

  const deleteSelfVolt = async (voltId) => {
    try {
      await apiService.deleteSelfVolt(voltId)
      setSelfVolts(prev => prev.filter(v => v.id !== voltId))
      return true
    } catch (err) {
      console.error('[SelfVolt] Error deleting volt:', err)
      return false
    }
  }

  const testSelfVolt = async (voltId) => {
    try {
      const response = await apiService.testSelfVolt(voltId)
      const status = response?.data?.status
      setSelfVolts(prev => prev.map(v => 
        v.id === voltId ? { ...v, status, lastPing: new Date().toISOString() } : v
      ))
      return status
    } catch (err) {
      console.error('[SelfVolt] Error testing volt:', err)
      return 'ERROR'
    }
  }

  const syncSelfVoltServers = async (voltId) => {
    try {
      await apiService.syncSelfVoltServers(voltId)
      await loadSelfVolts()
      return true
    } catch (err) {
      console.error('[SelfVolt] Error syncing servers:', err)
      return false
    }
  }

  const getVoltById = (voltId) => {
    return selfVolts.find(v => v.id === voltId) || null
  }

  const getVoltUrl = (voltId) => {
    const volt = selfVolts.find(v => v.id === voltId)
    return volt?.url || null
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadSelfVolts()
    }
  }, [isAuthenticated])

  const value = {
    selfVolts,
    loading,
    error,
    loadSelfVolts,
    addSelfVolt,
    updateSelfVolt,
    deleteSelfVolt,
    testSelfVolt,
    syncSelfVoltServers,
    getVoltById,
    getVoltUrl
  }

  return (
    <SelfVoltContext.Provider value={value}>
      {children}
    </SelfVoltContext.Provider>
  )
}
