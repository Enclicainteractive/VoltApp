import React, { useState } from 'react'
import { X, Folder, Trash2 } from 'lucide-react'
import { apiService } from '../../services/apiService'
import './Modal.css'

const CategorySettingsModal = ({ category, onClose, onUpdate, onDelete }) => {
  const [categoryData, setCategoryData] = useState({
    name: category?.name || ''
  })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = async () => {
    if (!categoryData.name.trim()) return
    
    setSaving(true)
    try {
      await apiService.updateCategory(category.id, { name: categoryData.name.trim() })
      onUpdate?.({ ...category, name: categoryData.name.trim() })
      onClose()
    } catch (err) {
      console.error('Failed to save category:', err)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    try {
      await apiService.deleteCategory(category.id)
      onDelete?.()
      onClose()
    } catch (err) {
      console.error('Failed to delete category:', err)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Folder size={24} />
            <h2>Category Settings</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Category Name</label>
            <div className="category-name-input">
              <Folder size={18} />
              <input
                type="text"
                className="input"
                value={categoryData.name}
                onChange={e => setCategoryData({ name: e.target.value })}
                maxLength={100}
              />
            </div>
          </div>

          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--volt-border)' }}>
            <h3 style={{ color: 'var(--volt-danger)', marginBottom: '10px', fontSize: '14px' }}>Danger Zone</h3>
            <button
              className="btn btn-danger"
              onClick={() => setConfirmDelete(true)}
              style={{ width: '100%' }}
            >
              <Trash2 size={16} style={{ marginRight: '8px' }} />
              Delete Category
            </button>
            <p style={{ fontSize: '12px', color: 'var(--volt-text-muted)', marginTop: '8px' }}>
              Deleting this category will move all channels in it to "No Category". This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !categoryData.name.trim()}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {confirmDelete && (
          <div className="delete-confirm-overlay" style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--border-radius-lg)'
          }}>
            <div className="delete-confirm-dialog" style={{
              background: 'var(--volt-bg-primary)',
              padding: '24px',
              borderRadius: 'var(--border-radius-md)',
              maxWidth: '350px',
              textAlign: 'center'
            }}>
              <h3>Delete Category</h3>
              <p>Are you sure you want to delete <strong>{category?.name}</strong>? Channels in this category will be moved to "No Category".</p>
              <div className="delete-confirm-actions" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button className="btn btn-danger" onClick={handleDelete}>Delete Category</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CategorySettingsModal
