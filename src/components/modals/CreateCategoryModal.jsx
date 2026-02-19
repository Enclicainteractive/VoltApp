import React, { useState } from 'react'
import { X, Folder } from 'lucide-react'
import { apiService } from '../../services/apiService'
import './Modal.css'

const CreateCategoryModal = ({ serverId, onClose, onSuccess }) => {
  const [categoryName, setCategoryName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!categoryName.trim()) {
      setError('Category name is required')
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
      setError(err.response?.data?.error || 'Failed to create category')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Category</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Category Name</label>
              <div className="category-name-input">
                <Folder size={18} />
                <input
                  type="text"
                  className="input"
                  placeholder="New Category"
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
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !categoryName.trim()}>
              {loading ? 'Creating...' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateCategoryModal
