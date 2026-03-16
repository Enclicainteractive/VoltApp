import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { CakeIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { apiService } from '../../services/apiService'
import { useAuth } from '../../contexts/AuthContext'
import './Modal.css'

const getExistingBirthDate = (user) => {
  const candidates = [
    user?.birthDate,
    user?.birthday,
    user?.birth_date,
    user?.dateOfBirth,
    user?.dob,
    user?.profile?.birthDate,
    user?.profile?.birthday,
    user?.profile?.birth_date,
    user?.profile?.dateOfBirth,
    user?.profile?.dob
  ]

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue
    const value = String(candidate).trim()
    if (!value || value === '0' || value.toLowerCase() === 'null') continue
    return value
  }

  return ''
}

const BirthDateRequiredModal = () => {
  const { user, refreshUser, logout } = useAuth()
  const existingBirthDate = getExistingBirthDate(user)
  const [birthDate, setBirthDate] = useState(existingBirthDate)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)

  if (!user || existingBirthDate || completed) return null
  if (typeof document === 'undefined') return null

  const handleSave = async (e) => {
    e.preventDefault()
    if (!birthDate) {
      setError('Enter your birthday to continue.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await apiService.updateProfile({ birthDate })
      setCompleted(true)
      await refreshUser?.()
    } catch (err) {
      setCompleted(false)
      setError(err?.response?.data?.error || 'Failed to save your birthday.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay" style={{ zIndex: 15000 }}>
      <div className="modal-content" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2><CakeIcon size={20} /> Add Your Birthday</h2>
          <button className="modal-close" onClick={logout} title="Log out">
            <XMarkIcon size={18} />
          </button>
        </div>
        <form onSubmit={handleSave} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, color: 'var(--volt-text-secondary)', lineHeight: 1.5 }}>
            We need your birthday on file before you keep using Volt. Some places require age checks and we do not want to get fined. We do not like the extra friction either, but we cannot afford to ignore it.
          </p>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--volt-text-primary)' }}>Birthday</span>
            <input
              className="input"
              type="date"
              autoComplete="bday"
              max={new Date().toISOString().slice(0, 10)}
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </label>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--volt-text-muted)' }}>
            This helps with age checks and local rules. It does not count as full adult verification by itself.
          </p>
          {error && <div className="test-error">{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={logout} disabled={saving}>
              Log out
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Birthday'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default BirthDateRequiredModal
