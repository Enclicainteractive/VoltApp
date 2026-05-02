import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import performanceService from '../services/performanceService'

// High-performance debounced search component
const DebouncedSearch = React.memo(({
  placeholder = "Search...",
  onSearch,
  onClear,
  debounceMs = 300,
  minSearchLength = 2,
  showClearButton = true,
  className = '',
  autoFocus = false,
  value: controlledValue,
  onChange: controlledOnChange
}) => {
  const [localValue, setLocalValue] = useState(controlledValue || '')
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef(null)
  const searchTimeoutRef = useRef(null)
  
  // Use controlled value if provided, otherwise use local state
  const value = controlledValue !== undefined ? controlledValue : localValue
  const isControlled = controlledValue !== undefined
  
  // Memoized debounced search function
  const debouncedSearch = useMemo(
    () => performanceService.debounce(async (searchTerm) => {
      if (searchTerm.length >= minSearchLength) {
        setIsSearching(true)
        try {
          await onSearch?.(searchTerm)
        } finally {
          setIsSearching(false)
        }
      } else if (searchTerm.length === 0) {
        onClear?.()
      }
    }, debounceMs),
    [onSearch, onClear, minSearchLength, debounceMs]
  )
  
  // Handle input changes
  const handleInputChange = useCallback((event) => {
    const newValue = event.target.value
    
    if (isControlled) {
      controlledOnChange?.(newValue)
    } else {
      setLocalValue(newValue)
    }
    
    // Trigger debounced search
    debouncedSearch(newValue)
  }, [isControlled, controlledOnChange, debouncedSearch])
  
  // Handle clear button
  const handleClear = useCallback(() => {
    const newValue = ''
    
    if (isControlled) {
      controlledOnChange?.(newValue)
    } else {
      setLocalValue(newValue)
    }
    
    onClear?.()
    inputRef.current?.focus()
  }, [isControlled, controlledOnChange, onClear])
  
  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      handleClear()
    } else if (event.key === 'Enter' && value.trim()) {
      // Immediate search on Enter
      setIsSearching(true)
      onSearch?.(value.trim()).finally(() => setIsSearching(false))
    }
  }, [handleClear, value, onSearch])
  
  // Auto-focus if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])
  
  const hasValue = value.length > 0
  const showSpinner = isSearching
  const showClear = showClearButton && hasValue && !showSpinner
  
  return (
    <div className={`debounced-search ${className}`}>
      <div className="search-input-wrapper">
        <div className="search-icon-wrapper">
          {showSpinner ? (
            <div className="search-spinner" />
          ) : (
            <MagnifyingGlassIcon className="search-icon" />
          )}
        </div>
        
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="search-input"
          aria-label="Search input"
          spellCheck={false}
          autoComplete="off"
        />
        
        {showClear && (
          <button
            type="button"
            onClick={handleClear}
            className="clear-button"
            aria-label="Clear search"
          >
            <XMarkIcon className="clear-icon" />
          </button>
        )}
      </div>
      
      {/* Search status indicator */}
      {value.length > 0 && value.length < minSearchLength && (
        <div className="search-status">
          Type at least {minSearchLength} characters to search
        </div>
      )}
    </div>
  )
})

DebouncedSearch.displayName = 'DebouncedSearch'

export default DebouncedSearch