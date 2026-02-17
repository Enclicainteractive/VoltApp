import React, { useState, useRef } from 'react'
import { Upload, X, FileText, Image, Video, Music, Loader } from 'lucide-react'
import { apiService } from '../services/apiService'
import '../assets/styles/FileUpload.css'

const FileUpload = ({ onUpload, onCancel, maxFiles = 10, serverId = null }) => {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const dropRef = useRef(null)

  const handleDragOver = (e) => {
    e.preventDefault()
    dropRef.current?.classList.add('drag-over')
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    dropRef.current?.classList.remove('drag-over')
  }

  const handleDrop = (e) => {
    e.preventDefault()
    dropRef.current?.classList.remove('drag-over')
    const dropped = Array.from(e.dataTransfer.files)
    addFiles(dropped)
  }

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files)
    addFiles(selected)
  }

  const addFiles = (newFiles) => {
    setError('')
    const totalFiles = files.length + newFiles.length
    
    if (totalFiles > maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`)
      return
    }

    const validFiles = newFiles.filter(file => {
      if (file.size > 25 * 1024 * 1024) {
        setError('File size must be under 25MB')
        return false
      }
      return true
    })

    setFiles(prev => [...prev, ...validFiles])
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const getFileIcon = (file) => {
    if (file.type.startsWith('image/')) return <Image size={24} />
    if (file.type.startsWith('video/')) return <Video size={24} />
    if (file.type.startsWith('audio/')) return <Music size={24} />
    return <FileText size={24} />
  }

  const getFilePreview = (file) => {
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file)
    }
    return null
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleUpload = async () => {
    if (files.length === 0) return

    setUploading(true)
    setError('')
    setUploadProgress({})

    try {
      const handleProgress = (percent) => {
        setUploadProgress({ overall: percent })
      }
      
      const res = await apiService.uploadFiles(files, serverId, handleProgress)
      onUpload?.(res.attachments || res.data?.attachments)
      setFiles([])
      setUploadProgress({})
    } catch (err) {
      setError(err.message || err.response?.data?.error || 'Upload failed')
      setUploadProgress({})
    }

    setUploading(false)
  }

  return (
    <div className="file-upload">
      <div 
        ref={dropRef}
        className="drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={32} />
        <p>Drag and drop files here or click to browse</p>
        <span className="drop-hint">Max 25MB per file, up to {maxFiles} files</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      </div>

      {error && <div className="upload-error">{error}</div>}

      {files.length > 0 && (
        <div className="file-list">
          {files.map((file, index) => {
            const preview = getFilePreview(file)
            return (
              <div key={index} className="file-item">
                {preview ? (
                  <img src={preview} alt={file.name} className="file-preview" />
                ) : (
                  <div className="file-icon">{getFileIcon(file)}</div>
                )}
                <div className="file-details">
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatSize(file.size)}</span>
                </div>
                <button className="file-remove" onClick={() => removeFile(index)}>
                  <X size={16} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="upload-actions">
        {uploading && uploadProgress.overall !== undefined && (
          <div className="upload-progress-bar">
            <div 
              className="upload-progress-fill" 
              style={{ width: `${uploadProgress.overall}%` }}
            />
            <span className="upload-progress-text">{Math.round(uploadProgress.overall)}%</span>
          </div>
        )}
        <button className="btn btn-secondary" onClick={onCancel} disabled={uploading}>
          Cancel
        </button>
        <button 
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
        >
          {uploading ? (
            <>
              <Loader size={16} className="spin" />
              Uploading...
            </>
          ) : (
            `Upload ${files.length} file${files.length !== 1 ? 's' : ''}`
          )}
        </button>
      </div>
    </div>
  )
}

export default FileUpload
