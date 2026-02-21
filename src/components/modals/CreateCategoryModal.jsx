import React, { useState } from 'react'
import { X, Folder } from 'lucide-react'
import { apiService } from '../../services/apiService'
import { useTranslation } from '../../hooks/useTranslation'
import './Modal.css'

const CreateCategoryModal = ({ serverId, onClose, onSuccess }) => {
  const { t } = useTranslation()
  const [categoryName, setCategoryName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!categoryName.trim()) {
      setError(t('modals.categoryNameRequired') || t('errors.invalidInput'))
      return
    }

    setLoading(true)
    setError('')

    try {
      await apiService.createCategory(serverId, {
        name: categoryName.trim()
      })
      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || t('errors.generic'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('modals.createCategory')}</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>{t('modals.categoryName')}</label>
              <div className="category-name-input">
                <Folder size={18} />
                <input
                  type="text"
                  className="input"
                  placeholder={t('modals.categoryNamePlaceholder')}
                  value={categoryName}
                  onChange={e => setCategoryName(e.target.value)}
                  autoFocus
                  maxLength={100}
                />
              </div>
            </div>

            {error && (
              <div className="error-message">{error}</div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !categoryName.trim()}>
              {loading ? t('common.loading') : t('modals.createCategory')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateCategoryModal
