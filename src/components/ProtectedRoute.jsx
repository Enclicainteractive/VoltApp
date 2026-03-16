import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useSocket } from '../contexts/SocketContext'
import { LoadingScreen } from './LoadingScreen'

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth()
  const { connected } = useSocket()

  if (loading) {
    return <LoadingScreen message="Loading your session..." />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!connected) {
    return <LoadingScreen message="Reconnecting..." />
  }

  return children
}

export default ProtectedRoute
